// Nonflowers herbarium
// A strip of specimen cards, each a generated plant painting. The selected
// specimen grows as a 3D model that turns slowly and can be turned and
// zoomed by hand. Plants are grown in background workers from seeds, so
// any specimen can be grown again exactly.

var GROW_MS = 1800   // time for a model to grow when selected
var BATCH = 10       // specimens added at a time
var KEEP = 14        // models kept in memory, nearest the selection
var MAX_PLANTS = 400 // specimens grown automatically at most
var REDUCED = window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

var plants = []       // every specimen, in strip order
var bySeed = new Map()
var current = null    // the selected specimen
var mode = "model"    // or "painting"
var starredOnly = false

function $(id){return document.getElementById(id)}
function ease(x){return x*x*(3-2*x)}

// ---------------------------------------------------------------- workers

// start a worker that grows plants; on a single-file page the generator and
// worker sources are embedded in the page instead of loaded as files
function makeWorker(){
  var main = $("src-main"), wk = $("src-worker")
  if (main && wk){
    // the generator needs the worker's stand-in page before it loads
    var page = "self.window = self;\n"
      +"self.document = {createElement:function(){return new OffscreenCanvas(300,150)}};\n"
      +"var NONFLOWERS_INLINE = true;\n"
    var blob = new Blob([page,main.textContent,"\n",wk.textContent],
      {type:"text/javascript"})
    return new Worker(URL.createObjectURL(blob))
  }
  return new Worker("plant-worker.js")
}

var Pool = new function(){
  var workers = []
  var queue = []
  this.init = function(){
    var n = Math.max(1,Math.min(3,(navigator.hardwareConcurrency || 2)-1))
    for (var i = 0; i < n; i++){
      var w = makeWorker()
      w.idle = true
      w.onmessage = (function(w){return function(e){
        var p = w.plant
        w.idle = true
        w.plant = null
        receive(p,e.data)
        pump()
      }})(w)
      workers.push(w)
    }
  }
  this.request = function(p){
    if (p.entry || p.status == "queued" || p.status == "growing"){return}
    p.status = "queued"
    queue.push(p)
    pump()
  }
  // grow the queued specimen nearest the selection first
  function pump(){
    workers.forEach(function(w){
      if (!w.idle || queue.length == 0){return}
      var at = current ? plants.indexOf(current) : 0
      var best = 0
      queue.forEach(function(p,i){
        if (Math.abs(plants.indexOf(p)-at) < Math.abs(plants.indexOf(queue[best])-at)){best = i}
      })
      var p = queue.splice(best,1)[0]
      p.status = "growing"
      w.idle = false
      w.plant = p
      w.postMessage({seed:p.seed})
    })
  }
  this.pump = pump
}

function receive(p,data){
  if (data.error){
    p.status = "error"
    p.el.classList.remove("pending")
    p.el.querySelector(".name").textContent = "Did not grow"
    console.error(data.error)
    return
  }
  p.meta = data.meta
  p.entry = {model:data.model,art:data.art,size:data.size}
  p.status = "ready"
  if (!p.thumbDone){
    var c = p.el.querySelector("canvas")
    c.getContext("2d").drawImage(data.thumb,0,0,c.width,c.height)
    p.thumbDone = true
  }
  data.thumb.close()
  p.el.classList.remove("pending")
  p.el.querySelector(".name").textContent = p.meta.name
  p.el.dataset.search = searchText(p)
  applyFilter(false)
  if (p == current){showCurrent()}
  evict()
}

// drop models far from the selection; they can be grown again from the seed
function evict(){
  var at = plants.indexOf(current)
  var ready = plants.filter((p)=>(p.entry && p != current))
  if (ready.length < KEEP){return}
  ready.sort((a,b)=>(Math.abs(plants.indexOf(b)-at)-Math.abs(plants.indexOf(a)-at)))
  for (var i = 0; i < ready.length-KEEP+1; i++){
    ready[i].entry.art.close()
    ready[i].entry = null
    ready[i].status = "new"
  }
}

// ------------------------------------------------------------- specimens

// the collection (seeds in order, and which are starred) is kept in this
// browser, so it is still there next time
var STORE_KEY = "nonflowers-herbarium-v1"
var restoring = false

function saveCollection(){
  if (restoring){return}
  try{
    localStorage.setItem(STORE_KEY,JSON.stringify({
      seeds:plants.map((p)=>(p.seed)),
      stars:plants.filter((p)=>(p.star)).map((p)=>(p.seed)),
    }))
  }catch(e){}
}

function loadCollection(){
  try{
    var d = JSON.parse(localStorage.getItem(STORE_KEY))
    if (d && Array.isArray(d.seeds) && d.seeds.length){return d}
  }catch(e){}
  return null
}

function setStar(p,on){
  p.star = on
  p.el.querySelector(".badge").hidden = !on
  p.el.dataset.search = searchText(p)
  if (p == current){showStar()}
  saveCollection()
}

function showStar(){
  var b = $("star")
  b.hidden = !current
  if (!current){return}
  b.setAttribute("aria-pressed",String(!!current.star))
  b.innerHTML = current.star ? "&#9733;" : "&#9734;"
  b.title = current.star ? "Unstar this specimen (S)" : "Star this specimen (S)"
}

function newSeed(){
  var s
  do {s = 100000+Math.floor(Math.random()*900000)} while (bySeed.has(s))
  return s
}

function addPlant(seed){
  if (bySeed.has(seed)){return bySeed.get(seed)}
  var p = {seed:seed,no:plants.length+1,meta:null,entry:null,status:"new",star:false}
  var el = document.createElement("button")
  el.type = "button"
  el.className = "card pending"
  el.setAttribute("role","option")
  el.setAttribute("aria-selected","false")
  el.innerHTML = '<div class="sheet"><canvas width="256" height="256"></canvas>'
    +'<span class="badge" aria-label="starred" hidden>&#9733;</span></div>'
    +'<div class="name">Growing&hellip;</div>'
    +'<div class="no">No. '+String(p.no).padStart(3,"0")+' &middot; '+seed+'</div>'
  el.dataset.search = searchText(p)
  el.addEventListener("click",function(){select(p,true)})
  p.el = el
  $("strip").insertBefore(el,$("more"))
  plants.push(p)
  bySeed.set(seed,p)
  Pool.request(p)
  saveCollection()
  return p
}

function addBatch(n){
  for (var i = 0; i < n; i++){addPlant(newSeed())}
}

function searchText(p){
  var t = ["no. "+p.no,String(p.seed)]
  if (p.star){t.push("starred")}
  if (p.meta){
    var m = p.meta
    t.push(m.name,m.habit,m.colour,m.leaves,m.petals+" petals")
  }
  return t.join(" ").toLowerCase()
}

function visible(){
  return plants.filter((p)=>(!p.el.hidden))
}

function select(p,scroll){
  if (p == current && !scroll){return}
  if (current){current.el.setAttribute("aria-selected","false")}
  current = p
  p.el.setAttribute("aria-selected","true")
  showStar()
  // the address names the specimen, so a link to it opens this plant
  try{history.replaceState(null,"","#seed-"+p.seed)}catch(e){}
  if (scroll){
    scrollTarget = p
    p.el.scrollIntoView({behavior:REDUCED ? "auto" : "smooth",inline:"center",block:"nearest"})
  }
  if (p.entry){
    showCurrent()
  }else{
    View.clear()
    showLabel()
    Pool.request(p)
    Pool.pump()
  }
  // keep the strip growing ahead of the reader
  if (!$("search").value && !starredOnly && plants.indexOf(p) >= plants.length-3
    && plants.length < MAX_PLANTS){
    addBatch(BATCH/2)
  }
}

function showCurrent(){
  View.show(current)
  showLabel()
  if (mode == "painting"){drawPainting()}
}

function showLabel(){
  var p = current
  $("label-no").textContent = "No. "+String(p.no).padStart(3,"0")+" · seed "+p.seed
  if (!p.meta){
    $("label-name").textContent = "Growing…"
    $("label-traits").textContent = ""
    $("status").textContent = "Growing specimen no. "+p.no+"…"
    return
  }
  var m = p.meta
  $("label-name").textContent = m.name
  var sw = '<span class="swatch" style="background:hsl('+Math.round(m.swatch[0])+','
    +Math.round(Math.min(1,m.swatch[1]*1.4)*100)+'%,'+Math.round(Math.min(0.85,m.swatch[2]*0.7)*100)+'%)"></span>'
  $("label-traits").innerHTML = sw+[m.colour+" flowers",m.petals+" petals",m.habit,m.leaves,
    "height "+m.height+" cm"].join(" · ")
  $("status").textContent = p.entry ? "" : "Growing specimen no. "+p.no+"…"
}

// ------------------------------------------------------------- 3D view

var View = new function(){
  var renderer, scene, camera, outer, inner, shadow
  var meshes = []
  var mats = []
  var FOV = 32
  var plant = null
  var n = 0
  var growStart = 0
  var radius = 300
  var yaw = -0.6, pitch = 0.18, zoom = 1, spin = 0
  var lastInput = -1e9
  var pointers = new Map()
  var pinch = 0

  this.init = function(canvas){
    renderer = new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2))
    renderer.setClearColor(0x000000,0)
    scene = new THREE.Scene()
    // parts further away fade a little into the paper
    scene.fog = new THREE.Fog(0xf1f1e7,1000,3000)
    camera = new THREE.PerspectiveCamera(FOV,1,1,20000)
    scene.add(camera)
    outer = new THREE.Group()
    inner = new THREE.Group()
    outer.add(inner)
    scene.add(outer)

    // soft daylight from above, and a lamp over the viewer's left shoulder
    // that stays put while the plant turns, so its surfaces catch the light.
    // The generator's colours are already shaded, so the light is gentle.
    scene.add(new THREE.HemisphereLight(0xffffff,0xd9d4bf,0.66))
    var lamp = new THREE.DirectionalLight(0xfff4e2,0.42)
    lamp.position.set(-0.6,0.8,1)
    camera.add(lamp)

    for (var g = 0; g < 4; g++){
      mats.push((g < 2)
        ? new THREE.MeshLambertMaterial({vertexColors:true,transparent:true,side:THREE.DoubleSide})
        : new THREE.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false}))
    }

    // a soft shadow on the ground under the plant
    var sc = document.createElement("canvas")
    sc.width = sc.height = 128
    var sx = sc.getContext("2d")
    var grad = sx.createRadialGradient(64,64,0,64,64,64)
    grad.addColorStop(0,"rgba(60,66,48,0.32)")
    grad.addColorStop(0.5,"rgba(60,66,48,0.12)")
    grad.addColorStop(1,"rgba(60,66,48,0)")
    sx.fillStyle = grad
    sx.fillRect(0,0,128,128)
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(1,1),
      new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(sc),transparent:true,depthWrite:false}))
    shadow.rotation.x = -Math.PI/2
    shadow.renderOrder = -1
    shadow.visible = false
    inner.add(shadow)

    // turn by dragging, zoom with the wheel or a pinch
    canvas.addEventListener("pointerdown",function(e){
      canvas.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId,[e.clientX,e.clientY])
      spin = 0
      lastInput = performance.now()
    })
    canvas.addEventListener("pointermove",function(e){
      if (!pointers.has(e.pointerId)){return}
      var prev = pointers.get(e.pointerId)
      var cur = [e.clientX,e.clientY]
      pointers.set(e.pointerId,cur)
      lastInput = performance.now()
      if (pointers.size == 1){
        var dx = cur[0]-prev[0], dy = cur[1]-prev[1]
        yaw += dx*0.008
        pitch = Math.max(-1.2,Math.min(1.2,pitch+dy*0.006))
        spin = dx*0.008
      }else if (pointers.size == 2){
        var ps = Array.from(pointers.values())
        var d = Math.hypot(ps[0][0]-ps[1][0],ps[0][1]-ps[1][1])
        if (pinch > 0){zoomBy(pinch/d)}
        pinch = d
      }
    })
    function up(e){
      pointers.delete(e.pointerId)
      if (pointers.size < 2){pinch = 0}
    }
    canvas.addEventListener("pointerup",up)
    canvas.addEventListener("pointercancel",up)
    canvas.addEventListener("wheel",function(e){
      e.preventDefault()
      zoomBy(Math.exp(e.deltaY*0.0012))
      lastInput = performance.now()
    },{passive:false})
    canvas.addEventListener("dblclick",function(){
      yaw = -0.6; pitch = 0.18; zoom = 1; spin = 0
    })
    requestAnimationFrame(frame)
  }

  function zoomBy(f){zoom = Math.max(0.25,Math.min(3,zoom*f))}

  this.clear = function(){
    meshes.forEach(function(m){inner.remove(m.mesh); m.mesh.geometry.dispose()})
    meshes = []
    plant = null
    n = 0
    shadow.visible = false
  }

  this.show = function(p){
    this.clear()
    plant = p
    var model = p.entry.model
    var order = [0,2,1,3] // stems & leaves, their veins, flowers, their veins
    for (var g = 0; g < 4; g++){
      var gr = model.groups[g]
      var geo = new THREE.BufferGeometry()
      geo.setAttribute("position",new THREE.BufferAttribute(gr.pos,3))
      geo.setAttribute("color",new THREE.BufferAttribute(gr.col,4))
      if (gr.nrm){geo.setAttribute("normal",new THREE.BufferAttribute(gr.nrm,3))}
      geo.setDrawRange(0,0)
      var mesh = (g < 2) ? new THREE.Mesh(geo,mats[g]) : new THREE.LineSegments(geo,mats[g])
      mesh.renderOrder = order[g]
      mesh.frustumCulled = false
      inner.add(mesh)
      meshes.push({mesh:mesh,upto:gr.upto})
    }
    n = model.n
    radius = model.radius
    inner.position.set(-model.center[0],-model.center[1],-model.center[2])
    // lay the shadow where the plant meets the ground
    var spread = Math.max(model.hi[0]-model.lo[0],model.hi[2]-model.lo[2])
    shadow.position.set(model.center[0],model.lo[1]-2,model.center[2])
    shadow.scale.set(spread*0.9+40,spread*0.9+40,1)
    shadow.visible = true
    growStart = performance.now()
  }

  var last = null
  function frame(t){
    requestAnimationFrame(frame)
    var dt = (last == null) ? 0 : Math.min(0.1,(t-last)/1000)
    last = t
    var c = renderer.domElement
    var w = c.clientWidth, h = c.clientHeight
    if (c.width != Math.floor(w*renderer.getPixelRatio()) || c.height != Math.floor(h*renderer.getPixelRatio())){
      renderer.setSize(w,h,false)
    }
    if (mode != "model" || w == 0 || h == 0){return}

    // keep turning after a drag, then settle back into a slow turn
    if (pointers.size == 0){
      if (t-lastInput > 2500 && !REDUCED){
        spin += (0.25*dt-spin)*0.05
      }else{
        spin *= 0.92
      }
      yaw += spin
    }

    var k = 0
    if (plant){
      var g = REDUCED ? 1 : Math.min(1,(t-growStart)/GROW_MS)
      k = Math.floor(n*ease(g))
    }
    meshes.forEach(function(m){m.mesh.geometry.setDrawRange(0,m.upto[k])})
    outer.rotation.set(pitch,yaw,0)

    // fit the whole plant, leaving room for the label above
    camera.aspect = w/h
    var vf = FOV*deg2rad/2
    var hf = Math.atan(Math.tan(vf)*camera.aspect)
    var dist = radius/Math.sin(Math.min(vf,hf))*1.08
    camera.position.set(0,radius*0.08,dist*zoom)
    camera.lookAt(0,radius*0.08,0)
    camera.updateProjectionMatrix()
    scene.fog.near = dist*zoom-radius*0.3
    scene.fog.far = dist*zoom+radius*4
    renderer.render(scene,camera)
  }
}
var deg2rad = Math.PI/180

// ------------------------------------------------------------- painting

function drawPainting(){
  var c = $("painting")
  if (!current || !current.entry){c.hidden = true; return}
  var art = current.entry.art
  c.width = art.width
  c.height = art.height
  c.getContext("2d").drawImage(art,0,0)
  var box = $("viewer")
  var s = Math.min(box.clientWidth-32,box.clientHeight-32)
  c.style.width = c.style.height = Math.max(100,s)+"px"
  c.hidden = false
}

function setMode(m){
  mode = m
  $("mode-model").setAttribute("aria-pressed",String(m == "model"))
  $("mode-painting").setAttribute("aria-pressed",String(m == "painting"))
  $("gl").style.visibility = (m == "model") ? "visible" : "hidden"
  if (m == "painting"){drawPainting()}else{$("painting").hidden = true}
}

// ------------------------------------------------------------- strip

var scrollTarget = null
var scrollTick = false

// select whichever card is under the middle of the strip
function pickCentered(){
  var strip = $("strip")
  var mid = strip.scrollLeft+strip.clientWidth/2
  var best = null, bd = Infinity
  visible().forEach(function(p){
    var d = Math.abs(p.el.offsetLeft+p.el.offsetWidth/2-mid)
    if (d < bd){bd = d; best = p}
  })
  if (!best){return}
  // while a clicked card scrolls into place, ignore the cards passed on the way
  if (scrollTarget){
    if (best != scrollTarget){return}
    scrollTarget = null
  }
  if (best != current){select(best,false)}
}

function step(d){
  var v = visible()
  var i = v.indexOf(current)
  var j = Math.max(0,Math.min(v.length-1,i+d))
  if (v[j]){select(v[j],true)}
}

function applyFilter(reselect){
  var q = $("search").value.trim().toLowerCase()
  var words = q.split(/\s+/).filter(Boolean)
  plants.forEach(function(p){
    var text = p.el.dataset.search
    p.el.hidden = !words.every((w)=>(text.indexOf(w) >= 0)) || (starredOnly && !p.star)
  })
  $("more").hidden = words.length > 0 || starredOnly
  var seed = /^\d{1,9}$/.test(q) ? parseInt(q) : null
  var gs = $("grow-seed")
  if (seed != null && !bySeed.has(seed)){
    gs.textContent = "Grow seed "+seed
    gs.hidden = false
  }else{
    gs.hidden = true
  }
  var v = visible()
  if (reselect && v.length && (!current || current.el.hidden)){select(v[0],true)}
  if (v.length == 0 && starredOnly && !words.length){
    $("status").textContent = "Nothing starred yet. Star a specimen with ☆ next to its name."
  }else if (v.length == 0 && (words.length || starredOnly)){
    $("status").textContent = "No "+(starredOnly ? "starred " : "")+"specimens match “"+q+"”."
  }else if (current){
    showLabel()
  }
}

// ------------------------------------------------------------- start

function start(){
  Pool.init()
  View.init($("gl"))

  $("strip").addEventListener("scroll",function(){
    if (scrollTick){return}
    scrollTick = true
    requestAnimationFrame(function(){scrollTick = false; pickCentered()})
  })
  $("prev").addEventListener("click",function(){step(-1)})
  $("next").addEventListener("click",function(){step(1)})
  $("more").addEventListener("click",function(){
    var first = plants.length
    addBatch(BATCH)
    select(plants[first],true)
  })
  $("search").addEventListener("input",function(){applyFilter(true)})
  $("grow-seed").addEventListener("click",function(){
    var p = addPlant(parseInt($("search").value.trim()))
    $("search").value = ""
    applyFilter(false)
    select(p,true)
  })
  $("star").addEventListener("click",function(){if (current){setStar(current,!current.star)}})
  $("starred-only").addEventListener("click",function(){
    starredOnly = !starredOnly
    this.setAttribute("aria-pressed",String(starredOnly))
    applyFilter(true)
  })
  $("mode-model").addEventListener("click",function(){setMode("model")})
  $("mode-painting").addEventListener("click",function(){setMode("painting")})
  window.addEventListener("resize",function(){if (mode == "painting"){drawPainting()}})
  document.addEventListener("keydown",function(e){
    if (e.target == $("search")){return}
    if (e.key == "ArrowRight"){e.preventDefault(); step(1)}
    if (e.key == "ArrowLeft"){e.preventDefault(); step(-1)}
    if ((e.key == "s" || e.key == "S") && current && !e.metaKey && !e.ctrlKey){
      setStar(current,!current.star)
    }
  })
  window.addEventListener("hashchange",function(){
    var p = fromHash()
    if (p && p != current){
      // make sure the linked specimen's card is not filtered out
      if (p.el.hidden){
        $("search").value = ""
        starredOnly = false
        $("starred-only").setAttribute("aria-pressed","false")
        applyFilter(false)
      }
      select(p,true)
    }
  })

  // bring back the saved collection, or start a new one
  var saved = loadCollection()
  if (saved){
    restoring = true
    saved.seeds.slice(0,MAX_PLANTS).forEach(addPlant)
    restoring = false
    ;(saved.stars || []).forEach(function(s){
      if (bySeed.has(s)){setStar(bySeed.get(s),true)}
    })
  }else{
    addBatch(BATCH)
  }
  var first = fromHash() || plants[0]
  $("strip").scrollLeft = 0
  select(first,first != plants[0])
}

// a link ending in #seed-123456 opens that specimen, growing it if needed
function fromHash(){
  var m = /^#seed-(\d{1,9})$/.exec(location.hash)
  return m ? addPlant(parseInt(m[1])) : null
}

if (document.readyState == "loading"){
  document.addEventListener("DOMContentLoaded",start)
}else{
  start()
}

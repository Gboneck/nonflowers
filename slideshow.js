// Nonflowers slideshow
// Grows each nonflower as a 3D model that turns in space, then presses it
// flat into a sheet of paper where it becomes the painting. Finished
// paintings are pushed aside onto a pile before the next flower grows.
// Reuses the generator in main.js and renders with three.js.

// settings, overridable with url arguments e.g. slideshow.html?grow=14&spin=6
var SHOW = {
  grow: 10,    // seconds spent growing the plant
  spin: 5,     // seconds the finished plant turns before it is pressed
  press: 3,    // seconds spent pressing it flat
  hold: 3,     // seconds a finished painting rests before being pushed aside
  pile: 4,     // finished paintings kept on the pile
}
parseArgs({
  grow:function(x){SHOW.grow = Math.max(0.5,parseFloat(x)) || SHOW.grow},
  spin:function(x){SHOW.spin = Math.max(0,parseFloat(x))},
  press:function(x){SHOW.press = Math.max(0.5,parseFloat(x)) || SHOW.press},
  hold:function(x){SHOW.hold = Math.max(0,parseFloat(x)) || SHOW.hold},
  pile:function(x){SHOW.pile = Math.max(0,parseInt(x)) || SHOW.pile},
})
var SPIN_SPEED = 2*PI/14  // radians per second
if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches){
  SPIN_SPEED = 2*PI/60
}

// the slideshow has no parameter summary panel
vizParams = function(){}

// record every polygon the generator draws, with its depth, so the plant
// can be rebuilt in 3D
var Recorder = new function(){
  var ops = null
  var blits = null
  var target = null
  var anchors = null
  var _polygon = polygon
  var _blit = Layer.blit

  polygon = function(args){
    var a = (args != undefined) ? args : {};
    if (ops != null && a.pts != undefined && a.pts.length > 1){
      var xof = a.xof || 0
      var yof = a.yof || 0
      ops.push({
        ctx:(a.ctx != undefined) ? a.ctx : CTX,
        pts:a.pts.map((p)=>([p[0]+xof,p[1]+yof,p[2]])),
        col:(a.col != undefined) ? a.col : "black",
        fil:(a.fil != undefined) ? a.fil : true,
      })
    }
    return _polygon(args)
  }

  // keep the plant's layers instead of compositing them onto the target,
  // so the sheet can be sized to fit the whole plant afterwards
  Layer.blit = function(ctx0,ctx1,args){
    if (ops != null && ctx0 == target){
      blits.set(ctx1,{lay:blits.size})
      return
    }
    return _blit.apply(this,arguments)
  }

  // Stems are drawn as flat ribbons of three strips across their width.
  // Wrap the strips around the spine into a round tube instead: a point
  // a fraction u across the ribbon sits at angle asin(2u-1) around the
  // tube, so seen from the front the tube covers the ribbon exactly.
  var SUB = 4  // facets per strip, on each side of the tube
  function tube(quads,spine){
    var out = []
    for (var q = 0; q < quads.length; q++){
      var o = quads[q]
      var i = Math.floor(q/3)+1
      var m = (q%3)/3
      var n = m+1/3
      var p = o.pts // corners: (i-1,m), (i,m), (i,n), (i-1,n)
      var ends = [[p[0],p[3],spine[i-1][2]],[p[1],p[2],spine[i][2]]].map(function(e){
        var D = [(e[1][0]-e[0][0])/(n-m),(e[1][1]-e[0][1])/(n-m)]
        return {
          C:[e[0][0]-(m-0.5)*D[0],e[0][1]-(m-0.5)*D[1]],
          D:D,
          r:Math.sqrt(D[0]*D[0]+D[1]*D[1])/2,
          z:e[2],
        }
      })
      function at(f,u,side){
        var s = 2*u-1
        return [f.C[0]+(u-0.5)*f.D[0],f.C[1]+(u-0.5)*f.D[1],
          f.z+side*f.r*Math.sqrt(Math.max(0,1-s*s))]
      }
      for (var side = -1; side <= 1; side += 2){
        for (var s = 0; s < SUB; s++){
          var u0 = m+(n-m)*s/SUB
          var u1 = m+(n-m)*(s+1)/SUB
          out.push({ctx:o.ctx,col:o.col,fil:true,pts:[
            at(ends[0],u0,side),at(ends[1],u0,side),
            at(ends[1],u1,side),at(ends[0],u1,side)]})
        }
      }
    }
    return out
  }

  // Stems and leaves are built in 3D around the point they grow from, but
  // the generator only passes on that point's x and y. Remember the depth
  // of every point a stem or leaf passes through, so whatever grows from
  // it later can be placed at the right depth. Outlines drawn in 2D get
  // the depth of the nearest point on their spine.
  function key(x,y){return x+","+y}
  function track(f,isStem){
    return function(args){
      if (ops == null){return f(args)}
      var a = (args != undefined) ? args : {};
      var xof = a.xof || 0
      var yof = a.yof || 0
      var base = anchors.get(key(xof,yof)) || 0
      var i0 = ops.length
      var P = f(args)
      var spine = P.map((p)=>([p[0]+xof,p[1]+yof,(isFinite(p[2]) ? p[2] : 0)+base]))
      for (var i = 0; i < spine.length; i++){
        anchors.set(key(spine[i][0],spine[i][1]),spine[i][2])
      }
      if (isStem){
        // a stem draws its ribbon strips, then an outline on either side
        var nq = (spine.length-1)*3
        var quads = ops.slice(i0,i0+nq)
        if (ops.length-i0 == nq+2 && quads.every((o)=>(o.fil && o.pts.length == 4))){
          var t = tube(quads,spine)
          ops.splice(i0,nq,...t)
          i0 += t.length
          // the outlines only make sense seen from the front
          for (var i = i0; i < ops.length; i++){ops[i].flat = true}
        }
      }
      for (var i = i0; i < ops.length; i++){
        var pts = ops[i].pts
        for (var j = 0; j < pts.length; j++){
          var p = pts[j]
          if (isFinite(p[2])){
            p[2] += base
          }else{
            var best = Infinity
            p[2] = base
            for (var k = 0; k < spine.length; k++){
              var d = Math.abs(spine[k][0]-p[0])+Math.abs(spine[k][1]-p[1])
              if (d < best){best = d; p[2] = spine[k][2]}
            }
          }
        }
      }
      return P
    }
  }
  stem = track(stem,true)
  leaf = track(leaf,false)

  this.start = function(ctx){
    ops = []
    blits = new Map()
    anchors = new Map()
    target = ctx
  }
  // returns the plant's layers (stems & leaves, then flowers) and its
  // strokes in drawing order, in layer coordinates, tagged with their layer
  this.stop = function(){
    var res = []
    var layers = []
    blits.forEach(function(b,ctx){layers[b.lay] = ctx})
    for (var i = 0; i < ops.length; i++){
      var o = ops[i]
      var b = blits.get(o.ctx)
      if (b == undefined){continue}
      o.lay = Math.min(b.lay,1)
      delete o.ctx
      res.push(o)
    }
    ops = null; blits = null; target = null; anchors = null
    return {layers:layers,strokes:res}
  }
}

var SHEET_MIN = 600   // smallest sheet, in generator pixels
var SHEET_MAX = 1200  // the generator's layers are this big
var SHEET_PAD = 30    // space between the plant and the edge of the sheet

// generate a painting: blank sheet, finished artwork, and its 3D strokes.
// The sheet is sized so the whole plant fits, with the plant centred.
function makePainting(){
  var ppr = paper({col:PAPER_COL1})
  var target = Layer.empty(1)
  Recorder.start(target)
  if (Math.random() <= 0.5){
    woody({ctx:target})
  }else{
    herbal({ctx:target})
  }
  var rec = Recorder.stop()
  var strokes = rec.strokes

  var xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
  strokes.forEach(function(o){
    o.pts.forEach(function(p){
      if (p[0] < xmin){xmin = p[0]} if (p[0] > xmax){xmax = p[0]}
      if (p[1] < ymin){ymin = p[1]} if (p[1] > ymax){ymax = p[1]}
    })
  })
  if (!isFinite(xmin)){xmin = xmax = ymin = ymax = SHEET_MAX/2}
  // the sheet's corners are rounded: (x/r)^3 + (y/r)^3 <= 1 inside,
  // with r = 0.98 of half the sheet, so fit the plant's box in that
  var a = (xmax-xmin)/2+SHEET_PAD
  var b = (ymax-ymin)/2+SHEET_PAD
  var S = Math.ceil(2/0.98*Math.cbrt(a*a*a+b*b*b))
  S = Math.min(SHEET_MAX,Math.max(SHEET_MIN,S))
  var ox = S/2-(xmin+xmax)/2
  var oy = S/2-(ymin+ymax)/2
  strokes.forEach(function(o){
    o.pts.forEach(function(p){p[0] += ox; p[1] += oy})
  })

  var sheet = Layer.empty(S)
  sheet.fillStyle = "white"
  sheet.fillRect(0,0,S,S)
  for (var i = 0; i < S; i+= 512){
    for (var j = 0; j < S; j+= 512){
      sheet.drawImage(ppr,i,j);
    }
  }
  // composite the plant the way the generator does
  var art = Layer.empty(S)
  art.drawImage(sheet.canvas,0,0)
  art.globalCompositeOperation = "multiply"
  rec.layers.forEach(function(l){art.drawImage(l.canvas,ox,oy)})
  art.globalCompositeOperation = "source-over"

  Layer.border(sheet,squircle(0.98,3))
  Layer.border(art,squircle(0.98,3))
  return {sheet:sheet,art:art,strokes:strokes,size:S}
}

// parse the css colors the generator produces
function parseRGBA(s){
  var m = /rgba?\(([^,]+),([^,]+),([^,)]+),?([^)]*)\)/.exec(s)
  if (m == null){return [0,0,0,1]}
  return [m[1]/255,m[2]/255,m[3]/255,(m[4] === "") ? 1 : parseFloat(m[4])]
}

// turn recorded strokes into vertex buffers, one per layer and kind,
// with the vertex count reached after each stroke so growth can be replayed
function buildModel(strokes,S){
  var n = strokes.length
  var groups = []
  for (var g = 0; g < 4; g++){ // fills of layer 0, 1, lines of layer 0, 1
    groups.push({count:0,at:0,upto:new Uint32Array(n+1)})
  }
  function kind(o){return (o.fil ? 0 : 2)+o.lay}
  function nverts(o){
    if (o.flat){return 0}
    return o.fil ? Math.max(0,o.pts.length-2)*3 : (o.pts.length-1)*2
  }
  for (var i = 0; i < n; i++){
    groups[kind(strokes[i])].count += nverts(strokes[i])
  }
  groups.forEach(function(gr){
    gr.pos = new Float32Array(gr.count*3)
    gr.col = new Float32Array(gr.count*4)
  })
  var gr, c
  function put(q){
    var k = gr.at++
    gr.pos[k*3] = q[0]-S/2
    gr.pos[k*3+1] = S/2-q[1]
    gr.pos[k*3+2] = q[2]
    gr.col[k*4] = c[0]; gr.col[k*4+1] = c[1]; gr.col[k*4+2] = c[2]; gr.col[k*4+3] = c[3]
  }
  var xmin = Infinity, xmax = -Infinity, zsum = 0, zn = 0
  for (var i = 0; i < n; i++){
    var o = strokes[i]
    var p = o.pts
    var m = p.length
    gr = groups[kind(o)]
    c = parseRGBA(o.col)
    if (o.flat){
      // drawn only in the finished painting
    }else if (o.fil){
      if (m <= 4){
        // small polygon: fan
        for (var j = 1; j < m-1; j++){put(p[0]); put(p[j]); put(p[j+1])}
      }else{
        // stroke outline, one side then the other reversed: a strip
        var h = Math.floor(m/2)
        for (var j = 0; j < h-1; j++){
          var a0 = p[j], a1 = p[j+1], b0 = p[m-1-j], b1 = p[m-2-j]
          put(a0); put(a1); put(b0)
          put(a1); put(b1); put(b0)
        }
        if (m % 2 == 1){put(p[h-1]); put(p[h]); put(p[h+1])}
      }
      for (var j = 0; j < m; j++){
        xmin = Math.min(xmin,p[j][0]); xmax = Math.max(xmax,p[j][0])
        zsum += p[j][2]; zn++
      }
    }else{
      for (var j = 0; j < m-1; j++){put(p[j]); put(p[j+1])}
    }
    for (var g = 0; g < 4; g++){groups[g].upto[i+1] = groups[g].at}
  }
  return {
    groups:groups,
    size:S,
    cx:isFinite(xmin) ? (xmin+xmax)/2-S/2 : 0,
    cz:zn ? zsum/zn : 0,
  }
}

// the 3D view: a camera looking at the sheet, placed so that the plane
// z = 0 lines up exactly with the card on screen
var View = new function(){
  var renderer, scene, camera, outer, inner
  var meshes = []
  var mats = []
  var cz = 0
  var DIST = 1400
  var dims = [1,1,1]
  var sheet = 600
  this.init = function(canvas){
    renderer = new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2))
    renderer.setClearColor(0x000000,0)
    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(30,1,10,10000)
    camera.position.set(0,0,DIST)
    camera.lookAt(0,0,0)
    outer = new THREE.Group()
    inner = new THREE.Group()
    outer.add(inner)
    scene.add(outer)
    for (var g = 0; g < 4; g++){
      mats.push((g < 2)
        ? new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,side:THREE.DoubleSide})
        : new THREE.LineBasicMaterial({vertexColors:true,transparent:true,depthWrite:false}))
    }
  }
  // fit the camera so the sheet's width in plant units spans the card
  this.resize = function(w,h,card){
    dims = [w,h,card]
    renderer.setSize(w,h,false)
    camera.aspect = w/h
    camera.fov = 2*Math.atan(h*sheet/card/2/DIST)*rad2deg
    camera.updateProjectionMatrix()
  }
  this.load = function(model){
    this.clear()
    var order = [0,2,1,3] // stems & leaves, their veins, flowers, their veins
    for (var g = 0; g < 4; g++){
      var gr = model.groups[g]
      var geo = new THREE.BufferGeometry()
      geo.setAttribute("position",new THREE.BufferAttribute(gr.pos,3))
      geo.setAttribute("color",new THREE.BufferAttribute(gr.col,4))
      geo.setDrawRange(0,0)
      var mesh = (g < 2) ? new THREE.Mesh(geo,mats[g]) : new THREE.LineSegments(geo,mats[g])
      mesh.renderOrder = order[g]
      mesh.frustumCulled = false
      inner.add(mesh)
      meshes.push({mesh:mesh,upto:gr.upto})
    }
    sheet = model.size
    this.resize(dims[0],dims[1],dims[2])
    outer.position.set(model.cx,0,0)
    inner.position.set(-model.cx,0,0)
    cz = model.cz
  }
  this.clear = function(){
    meshes.forEach(function(m){inner.remove(m.mesh); m.mesh.geometry.dispose()})
    meshes = []
    renderer.clear()
  }
  // show the first k strokes, turned by angle and tilt, with depth scaled by zs
  this.draw = function(k,angle,tilt,zs){
    meshes.forEach(function(m){m.mesh.geometry.setDrawRange(0,m.upto[k])})
    outer.rotation.set(tilt,angle,0)
    inner.scale.set(1,1,Math.max(zs,1e-4))
    inner.position.z = -cz*zs
    // once nearly flat, paint in drawing order like the 2D original
    var flat = zs < 0.12
    for (var g = 0; g < 4; g++){
      mats[g].depthTest = !flat
      mats[g].depthWrite = !flat && g < 2
    }
    renderer.render(scene,camera)
  }
}

var STAGE
var GL
var CARDS = []   // CARDS[0] is the current painting, the rest are on the pile
var COUNT = 0
var PAUSED = false
var RESUME = []  // callbacks waiting for unpause

function whenRunning(f){
  if (PAUSED){RESUME.push(f)}else{f()}
}

function togglePause(){
  PAUSED = !PAUSED
  document.getElementById("btn-pause").innerHTML = PAUSED ? "play" : "pause"
  if (!PAUSED){
    var fs = RESUME; RESUME = []
    fs.forEach((f)=>f())
  }
}

// card size, matching --w in slideshow.css
function cardWidth(){
  return Math.min(600,0.78*Math.min(window.innerWidth,window.innerHeight))
}

// a card is a sheet of paper on the stage
function makeCard(painting){
  COUNT += 1
  var el = document.createElement("div")
  el.className = "card"
  var view = Layer.empty(painting.size)
  el.appendChild(view.canvas)
  var cap = document.createElement("div")
  cap.className = "caption"
  cap.innerHTML = "No. "+COUNT
  el.appendChild(cap)
  return {el:el,view:view,painting:painting,show:0,tilt:normRand(-6,6)}
}

// place every card: the newest in the middle, older ones piled to the left
function layout(){
  var sw = STAGE.clientWidth
  View.resize(STAGE.clientWidth,STAGE.clientHeight,cardWidth())
  for (var i = 0; i < CARDS.length; i++){
    var c = CARDS[i]
    if (i == 0){
      c.el.style.transform = ""
      c.el.style.opacity = c.show
      continue
    }
    var w = c.el.offsetWidth
    var k = i-1
    var s = 0.55-k*0.04
    var cx = 24+w*s/2-k*w*0.12
    var dx = cx-sw/2
    var dy = k*14+w*0.08
    c.el.style.transform =
      "translate("+dx+"px,"+dy+"px) rotate("+(c.tilt-k*2)+"deg) scale("+s+")"
    c.el.style.opacity = (i > SHOW.pile) ? 0 : Math.max(0,1-k*0.22)
    c.el.style.zIndex = 100-i
  }
}

function ease(x){return x*x*(3-2*x)}

// grow the plant in 3D, turn it, press it into the paper, then call done
function perform(c,done){
  var n = c.painting.strokes.length
  View.load(buildModel(c.painting.strokes,c.painting.size))

  var T1 = SHOW.grow*1000
  var T2 = T1+SHOW.spin*1000
  var T3 = T2+SHOW.press*1000
  var T4 = T3+900
  var a0 = normRand(-1,1)*PI
  var dir = randChoice([-1,1])
  var tilt0 = normRand(0.15,0.35)
  var a2 = null, aEnd = null
  var elapsed = 0
  var last = null
  var v = c.view
  var sheet = c.painting.sheet.canvas
  var art = c.painting.art.canvas

  function frame(t){
    if (last == null){last = t}
    if (!PAUSED){elapsed += Math.min(t-last,100)}
    last = t
    var e = elapsed

    var k = (e < T1) ? Math.floor(n*ease(e/T1)) : n
    var angle, tilt, zs
    if (e < T2){
      angle = a0+dir*SPIN_SPEED*e/1000
      tilt = tilt0
      zs = 1
    }else{
      // slow down to face the viewer while closing like a flower press
      if (a2 == null){
        a2 = a0+dir*SPIN_SPEED*T2/1000
        var coast = a2+dir*SPIN_SPEED*SHOW.press/3
        aEnd = (dir > 0) ? Math.ceil(coast/(2*PI))*2*PI : Math.floor(coast/(2*PI))*2*PI
      }
      var p = Math.min(1,(e-T2)/(T3-T2))
      angle = a2+(aEnd-a2)*(1-Math.pow(1-p,3))
      tilt = tilt0*(1-ease(p))
      zs = 1-ease(p)
      c.show = Math.min(1,p*2)
      c.el.style.opacity = c.show
    }
    View.draw(k,angle,tilt,zs)

    // swap the pressed plant for the painted one
    if (e >= T3){
      var f = Math.min(1,(e-T3)/(T4-T3))
      GL.style.opacity = 1-f
      v.globalAlpha = 1
      v.drawImage(sheet,0,0)
      v.globalAlpha = f
      v.drawImage(art,0,0)
      v.globalAlpha = 1
    }
    if (e < T4){
      requestAnimationFrame(frame)
    }else{
      View.clear()
      GL.style.opacity = 1
      // only the finished image is needed from now on
      c.painting = null
      done()
    }
  }
  v.drawImage(sheet,0,0)
  requestAnimationFrame(frame)
}

// generate the next plant, push the last one aside, and grow it
function next(){
  var c = makeCard(makePainting())
  CARDS.unshift(c)
  STAGE.appendChild(c.el)
  c.el.style.zIndex = 100
  document.getElementById("loader").style.display = "none"
  layout()

  // drop paintings that slid off the pile
  while (CARDS.length > SHOW.pile+2){
    STAGE.removeChild(CARDS.pop().el)
  }
  setTimeout(function(){
    perform(c,function(){
      setTimeout(function(){
        // generating blocks the page, so let the last frame show first
        whenRunning(function(){setTimeout(next,30)})
      },SHOW.hold*1000)
    })
  },CARDS.length > 1 ? 1400 : 100)
}

function startShow(){
  makeBG()
  STAGE = document.getElementById("stage")
  GL = document.getElementById("gl")
  View.init(GL)
  layout()
  window.addEventListener("resize",layout)
  document.addEventListener("keydown",function(e){
    if (e.code == "Space"){e.preventDefault();togglePause()}
  })
  setTimeout(next,100)
}

// Nonflowers slideshow
// Paints one nonflower after another on an easel in a 3D room. Each plant
// turns in space while it is painted and settles flat as it is finished,
// then the sheet is lifted off and hung on the gallery wall.
// Reuses the generator in main.js; load this script after it.

// settings, overridable with url arguments e.g. slideshow.html?paint=20&hold=5
var SHOW = {
  paint: 14,   // seconds spent painting one plant
  hold: 3,     // seconds a finished painting rests on the easel
  pile: 5,     // finished paintings kept on the wall
  turn: 1,     // how far plants turn while painted (0 = flat)
}
parseArgs({
  paint:function(x){SHOW.paint = Math.max(1,parseFloat(x)) || SHOW.paint},
  hold:function(x){SHOW.hold = Math.max(0,parseFloat(x)) || SHOW.hold},
  pile:function(x){SHOW.pile = Math.max(0,parseInt(x)) || SHOW.pile},
  turn:function(x){SHOW.turn = Math.max(0,parseFloat(x))},
})
if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches){
  SHOW.turn = 0
}

// the slideshow has no parameter summary panel
vizParams = function(){}

var SLICES = 10  // depth slices used to turn the plant in 3D

// record every polygon the generator draws, so it can be replayed later
var Recorder = new function(){
  var ops = null
  var blits = null
  var target = null
  var _polygon = polygon
  var _blit = Layer.blit

  polygon = function(args){
    var a = (args != undefined) ? args : {};
    if (ops != null && a.pts != undefined && a.pts.length > 1){
      var xof = a.xof || 0
      var yof = a.yof || 0
      var fil = (a.fil != undefined) ? a.fil : true
      var z = 0
      for (var i = 0; i < a.pts.length; i++){
        z += isFinite(a.pts[i][2]) ? a.pts[i][2] : 0
      }
      ops.push({
        ctx:(a.ctx != undefined) ? a.ctx : CTX,
        pts:a.pts.map((p)=>([p[0]+xof,p[1]+yof])),
        z:z/a.pts.length,
        col:(a.col != undefined) ? a.col : "black",
        fil:fil,
        str:(a.str != undefined) ? a.str : !fil,
      })
    }
    return _polygon(args)
  }
  // layers get composited onto the target at an offset; remember it
  Layer.blit = function(ctx0,ctx1,args){
    if (ops != null && ctx0 == target){
      var a = (args != undefined) ? args : {};
      blits.set(ctx1,{xof:a.xof || 0,yof:a.yof || 0,lay:blits.size})
    }
    return _blit.apply(this,arguments)
  }
  this.start = function(ctx){
    ops = []
    blits = new Map()
    target = ctx
  }
  // returns strokes in drawing order, in target coordinates,
  // tagged with the layer they were drawn on (0: stems & leaves, 1: flowers)
  this.stop = function(){
    var res = []
    for (var i = 0; i < ops.length; i++){
      var o = ops[i]
      var b = (o.ctx == target) ? {xof:0,yof:0,lay:1} : blits.get(o.ctx)
      if (b == undefined){continue}
      o.pts.forEach((p)=>{p[0]+=b.xof; p[1]+=b.yof})
      o.lay = Math.min(b.lay,1)
      delete o.ctx
      res.push(o)
    }
    ops = null; blits = null; target = null
    return res
  }
}

// generate a painting: blank sheet, finished artwork, and its strokes
function makePainting(){
  var sheet = Layer.empty()
  sheet.fillStyle = "white"
  sheet.fillRect(0,0,sheet.canvas.width,sheet.canvas.height)
  var ppr = paper({col:PAPER_COL1})
  for (var i = 0; i < sheet.canvas.width; i+= 512){
    for (var j = 0; j < sheet.canvas.height; j+= 512){
      sheet.drawImage(ppr,i,j);
    }
  }
  var art = Layer.empty()
  art.drawImage(sheet.canvas,0,0)

  Recorder.start(art)
  if (Math.random() <= 0.5){
    woody({ctx:art,xof:300,yof:550,})
  }else{
    herbal({ctx:art,xof:300,yof:600,})
  }
  var strokes = Recorder.stop()
  art.globalCompositeOperation = "source-over"

  Layer.border(sheet,squircle(0.98,3))
  Layer.border(art,squircle(0.98,3))

  // sort strokes into depth slices
  var zmin = Infinity, zmax = -Infinity, xmin = Infinity, xmax = -Infinity
  strokes.forEach(function(o){
    zmin = Math.min(zmin,o.z); zmax = Math.max(zmax,o.z)
    xmin = Math.min(xmin,o.pts[0][0]); xmax = Math.max(xmax,o.pts[0][0])
  })
  var zs = Math.max(zmax-zmin,1e-6)
  strokes.forEach(function(o){
    o.slice = Math.min(SLICES-1,Math.floor((o.z-zmin)/zs*SLICES))
  })
  var depth = []
  for (var i = 0; i < SLICES; i++){depth.push(zmin+(i+0.5)/SLICES*zs)}

  return {sheet:sheet,art:art,strokes:strokes,depth:depth,
    cx:isFinite(xmin) ? (xmin+xmax)/2 : 300}
}

var STAGE
var WORLD
var CARDS = []   // CARDS[0] is on the easel, the rest hang on the wall
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

// a card is a sheet of paper in the room
function makeCard(painting){
  COUNT += 1
  var el = document.createElement("div")
  el.className = "card"
  var view = Layer.empty()
  view.drawImage(painting.sheet.canvas,0,0)
  el.appendChild(view.canvas)
  var cap = document.createElement("div")
  cap.className = "caption"
  cap.innerHTML = "No. "+COUNT
  el.appendChild(cap)
  var layers = []
  for (var l = 0; l < 2; l++){
    var s = []
    for (var i = 0; i < SLICES; i++){s.push(Layer.empty())}
    layers.push(s)
  }
  return {
    el:el,
    view:view,
    tmp:Layer.empty(),
    layers:layers,
    painting:painting,
    tilt:normRand(-1.5,1.5),
  }
}

// css transform for a pose; every pose uses the same function list
// so the browser interpolates between them smoothly
function pose(x,y,z,ry,rx,rz,s){
  return "translate3d("+x+"px,"+y+"px,"+z+"px) rotateY("+ry+"deg) rotateX("
    +rx+"deg) rotateZ("+rz+"deg) scale("+s+")"
}

// room geometry, in multiples of the card width
var ROOM = {
  turn: -26,      // the camera looks into the room at an angle (deg)
  easelX: 0.3,    // easel position
  wallZ: -0.75,   // back wall depth
  floorY: 0.98,   // floor height
  hangScale: 0.6, // size of hung paintings
  hangGap: 0.72,  // spacing of hung paintings
}

// position of the k-th painting on the wall (k = 1 is nearest the easel)
function wallSlot(k,w){
  return {
    x:w*(ROOM.easelX-1.5-(k-1)*ROOM.hangGap),
    y:-w*0.12,
    z:w*ROOM.wallZ+2,
  }
}

// place the room and every card in it
function layout(){
  // matches --w in slideshow.css
  var w = Math.min(520,0.58*Math.min(window.innerWidth,window.innerHeight))
  // keep the easel a little right of the middle of the screen
  var ex = w*ROOM.easelX
  WORLD.style.transform = "translate3d("+(-w*0.5)+"px,0px,0px) rotateY("+ROOM.turn+"deg)"

  var len = w*12
  var hgt = w*2.6
  var wall = document.getElementById("wall")
  wall.style.width = len+"px"
  wall.style.height = hgt+"px"
  wall.style.margin = (-hgt/2)+"px 0 0 "+(-len/2)+"px"
  wall.style.transform = pose(-len*0.3,w*ROOM.floorY-hgt/2,w*ROOM.wallZ,0,0,0,1)

  var floor = document.getElementById("floor")
  var fs = w*12
  floor.style.width = fs+"px"
  floor.style.height = fs+"px"
  floor.style.margin = (-fs/2)+"px 0 0 "+(-fs/2)+"px"
  floor.style.transform = "translate3d("+(-fs*0.3)+"px,"+(w*ROOM.floorY)+"px,"
    +(w*ROOM.wallZ+fs/2)+"px) rotateX(90deg)"

  document.getElementById("easel").style.transform =
    "translate3d("+ex+"px,0px,0px)"

  for (var i = 0; i < CARDS.length; i++){
    var c = CARDS[i]
    if (c.state == "lifted"){continue}
    if (i == 0){
      c.el.style.transform = (c.state == "entering")
        ? pose(ex,-w*0.9,-w*0.2,0,5,0,1)
        : pose(ex,0,0,0,5,0,1)
      c.el.style.opacity = (c.state == "entering") ? 0 : 1
      continue
    }
    var p = wallSlot(i,w)
    c.el.style.transform = pose(p.x,p.y,p.z,0,0,c.tilt,ROOM.hangScale)
    c.el.style.opacity = (i > SHOW.pile) ? 0 : 1
  }
}

// draw one recorded polygon
function drawOp(ctx,o){
  var pts = o.pts
  ctx.beginPath()
  ctx.moveTo(pts[0][0],pts[0][1])
  for (var j = 1; j < pts.length; j++){
    ctx.lineTo(pts[j][0],pts[j][1])
  }
  if (o.fil){ctx.fillStyle = o.col; ctx.fill()}
  if (o.str){ctx.strokeStyle = o.col; ctx.stroke()}
}

// draw the plant painted so far, turned by angle (radians) about its stem
function render(c,angle,finish){
  var p = c.painting
  var v = c.view
  var t = c.tmp
  var W = v.canvas.width
  var ca = Math.cos(angle), sa = Math.sin(angle)

  v.setTransform(1,0,0,1,0,0)
  v.globalCompositeOperation = "source-over"
  v.globalAlpha = 1
  v.clearRect(0,0,W,W)
  v.drawImage(p.sheet.canvas,0,0)

  for (var l = 0; l < 2; l++){
    t.setTransform(1,0,0,1,0,0)
    t.clearRect(0,0,W,W)
    // back to front
    for (var i = 0; i < SLICES; i++){
      var z = p.depth[i]
      t.setTransform(ca,0,0,1,p.cx-ca*p.cx+z*sa,0)
      t.drawImage(c.layers[l][i].canvas,0,0)
    }
    t.setTransform(1,0,0,1,0,0)
    // the generator composites both layers with multiply
    v.globalCompositeOperation = "multiply"
    v.globalAlpha = (l == 0) ? 0.85 : 1
    v.drawImage(t.canvas,0,0)
  }
  // keep the paint on the sheet
  v.globalAlpha = 1
  v.globalCompositeOperation = "destination-in"
  v.drawImage(p.sheet.canvas,0,0)
  v.globalCompositeOperation = "source-over"

  if (finish > 0){
    v.globalAlpha = finish
    v.drawImage(p.art.canvas,0,0)
    v.globalAlpha = 1
  }
}

// animate the painting of a card, then call done
function paint(c,done){
  var ops = c.painting.strokes
  var n = ops.length
  var dur = SHOW.paint*1000
  var fade = 900
  var amp = SHOW.turn*normRand(0.45,0.85)*randChoice([-1,1])
  var elapsed = 0
  var drawn = 0
  var last = null
  function frame(t){
    if (last == null){last = t}
    if (!PAUSED){elapsed += Math.min(t-last,100)}
    last = t

    var x = Math.min(1,elapsed/dur)
    var target = Math.floor(n*x*x*(3-2*x))
    for (; drawn < target; drawn++){
      var o = ops[drawn]
      drawOp(c.layers[o.lay][o.slice],o)
    }
    // turn back to face the viewer as the painting nears completion
    var settle = Math.min(1,x/0.92)
    var angle = amp*Math.pow(1-settle,2)*Math.cos(settle*PI*0.5)
    var finish = Math.min(1,Math.max(0,(elapsed-dur)/fade))
    render(c,angle,finish)

    if (finish < 1){
      requestAnimationFrame(frame)
    }else{
      // only the finished image is needed from now on
      c.tmp = c.layers = c.painting = null
      done()
    }
  }
  requestAnimationFrame(frame)
}

// lift the finished painting off the easel, ready to be hung
function lift(c){
  var w = c.el.offsetWidth
  c.state = "lifted"
  c.el.style.transitionDuration = "0.9s"
  c.el.style.transform = pose(w*(ROOM.easelX-0.25),-w*0.2,w*0.3,14,0,-3,0.9)
}

// generate the next plant, hang the last one, and paint
function next(){
  var c = makeCard(makePainting())
  document.getElementById("loader").style.display = "none"

  var prev = CARDS[0]
  if (prev != undefined){lift(prev)}

  c.state = "entering"
  CARDS.unshift(c)
  WORLD.appendChild(c.el)
  layout()
  c.el.offsetWidth // commit the entering pose before transitioning

  setTimeout(function(){
    if (prev != undefined){
      prev.state = "hung"
      prev.el.style.transitionDuration = ""
    }
    c.state = "easel"
    layout()
    // drop paintings that went past the end of the wall
    while (CARDS.length > SHOW.pile+2){
      WORLD.removeChild(CARDS.pop().el)
    }
  },prev != undefined ? 950 : 50)

  setTimeout(function(){
    paint(c,function(){
      setTimeout(function(){
        // generating blocks the page, so let the last frame show first
        whenRunning(function(){setTimeout(next,30)})
      },SHOW.hold*1000)
    })
  },prev != undefined ? 2400 : 1400)
}

function startShow(){
  STAGE = document.getElementById("stage")
  WORLD = document.getElementById("world")
  layout()
  window.addEventListener("resize",layout)
  document.addEventListener("keydown",function(e){
    if (e.code == "Space"){e.preventDefault();togglePause()}
  })
  setTimeout(next,100)
}

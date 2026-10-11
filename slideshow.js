// Nonflowers slideshow
// Paints one nonflower after another, stroke by stroke, and pushes
// each finished painting aside onto a pile before starting the next.
// Reuses the generator in main.js; load this script after it.

// settings, overridable with url arguments e.g. slideshow.html?paint=20&hold=5
var SHOW = {
  paint: 14,   // seconds spent painting one plant
  hold: 3,     // seconds a finished painting rests before being pushed aside
  pile: 4,     // finished paintings kept on the pile
}
parseArgs({
  paint:function(x){SHOW.paint = Math.max(1,parseFloat(x)) || SHOW.paint},
  hold:function(x){SHOW.hold = Math.max(0,parseFloat(x)) || SHOW.hold},
  pile:function(x){SHOW.pile = Math.max(0,parseInt(x)) || SHOW.pile},
})

// the slideshow has no parameter summary panel
vizParams = function(){}

// record every polygon the generator draws, so it can be replayed later
var Recorder = new function(){
  var ops = null
  var offsets = null
  var target = null
  var _polygon = polygon
  var _blit = Layer.blit

  polygon = function(args){
    var a = (args != undefined) ? args : {};
    if (ops != null && a.pts != undefined && a.pts.length > 1){
      var xof = a.xof || 0
      var yof = a.yof || 0
      ops.push({
        ctx:(a.ctx != undefined) ? a.ctx : CTX,
        pts:a.pts.map((p)=>([p[0]+xof,p[1]+yof])),
        fil:(a.fil != undefined) ? a.fil : true,
      })
    }
    return _polygon(args)
  }
  // layers get composited onto the target at an offset; remember it
  Layer.blit = function(ctx0,ctx1,args){
    if (ops != null && ctx0 == target){
      var a = (args != undefined) ? args : {};
      offsets.set(ctx1,[a.xof || 0,a.yof || 0])
    }
    return _blit.apply(this,arguments)
  }
  this.start = function(ctx){
    ops = []
    offsets = new Map()
    target = ctx
  }
  // returns strokes in drawing order, in target coordinates
  this.stop = function(){
    var res = []
    for (var i = 0; i < ops.length; i++){
      var o = ops[i]
      var of = (o.ctx == target) ? [0,0] : offsets.get(o.ctx)
      if (of == undefined){continue}
      res.push({fil:o.fil,pts:o.pts.map((p)=>([p[0]+of[0],p[1]+of[1]]))})
    }
    ops = null; offsets = null; target = null
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
  return {sheet:sheet,art:art,strokes:strokes}
}

var STAGE
var CARDS = []   // CARDS[0] is on the easel, the rest are on the pile
var COUNT = 0
var PAUSED = false
var RESUME = []  // callbacks waiting for unpause

function whenRunning(f){
  if (PAUSED){RESUME.push(f)}else{f()}
}

function togglePause(){
  PAUSED = !PAUSED
  document.getElementById("btn-pause").innerHTML = PAUSED ? "play_arrow" : "pause"
  if (!PAUSED){
    var fs = RESUME; RESUME = []
    fs.forEach((f)=>f())
  }
}

// a card is a sheet of paper on the stage
function makeCard(painting){
  COUNT += 1
  var el = document.createElement("div")
  el.className = "card entering"
  var view = Layer.empty()
  view.drawImage(painting.sheet.canvas,0,0)
  el.appendChild(view.canvas)
  var cap = document.createElement("div")
  cap.className = "caption"
  cap.innerHTML = "No. "+COUNT
  el.appendChild(cap)
  return {
    el:el,
    view:view,
    mask:Layer.empty(),
    tmp:Layer.empty(),
    painting:painting,
    tilt:normRand(-6,6),
  }
}

// place every card: newest on the easel, older ones piled to the left
function layout(){
  var sw = STAGE.clientWidth
  for (var i = 0; i < CARDS.length; i++){
    var c = CARDS[i]
    if (i == 0){
      c.el.style.transform = ""
      c.el.style.opacity = c.el.classList.contains("entering") ? 0 : 1
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

// draw the strokes painted so far, revealing the finished artwork beneath
function render(c,finish){
  var p = c.painting
  var v = c.view
  v.globalCompositeOperation = "source-over"
  v.globalAlpha = 1
  v.clearRect(0,0,v.canvas.width,v.canvas.height)
  v.drawImage(p.sheet.canvas,0,0)

  c.tmp.globalCompositeOperation = "copy"
  c.tmp.drawImage(c.mask.canvas,0,0)
  c.tmp.globalCompositeOperation = "source-in"
  c.tmp.drawImage(p.art.canvas,0,0)
  v.drawImage(c.tmp.canvas,0,0)

  if (finish > 0){
    v.globalAlpha = finish
    v.drawImage(p.art.canvas,0,0)
    v.globalAlpha = 1
  }
}

// paint strokes onto the reveal mask
function brush(mask,ops){
  mask.fillStyle = "white"
  mask.strokeStyle = "white"
  mask.lineWidth = 2.5
  mask.lineJoin = "round"
  mask.lineCap = "round"
  for (var i = 0; i < ops.length; i++){
    var pts = ops[i].pts
    mask.beginPath()
    mask.moveTo(pts[0][0],pts[0][1])
    for (var j = 1; j < pts.length; j++){
      mask.lineTo(pts[j][0],pts[j][1])
    }
    if (ops[i].fil){mask.fill()}
    mask.stroke()
  }
}

// animate the painting of a card, then call done
function paint(c,done){
  var ops = c.painting.strokes
  var n = ops.length
  var dur = SHOW.paint*1000
  var fade = 800
  var elapsed = 0
  var drawn = 0
  var last = null
  function frame(t){
    if (last == null){last = t}
    if (!PAUSED){elapsed += Math.min(t-last,100)}
    last = t

    var x = Math.min(1,elapsed/dur)
    var target = Math.floor(n*x*x*(3-2*x))
    if (target > drawn){
      brush(c.mask,ops.slice(drawn,target))
      drawn = target
    }
    var finish = Math.min(1,Math.max(0,(elapsed-dur)/fade))
    render(c,finish)

    if (finish < 1){
      requestAnimationFrame(frame)
    }else{
      // only the finished image is needed from now on
      c.mask = c.tmp = c.painting = null
      done()
    }
  }
  requestAnimationFrame(frame)
}

// generate the next plant, push the last one aside, and paint
function next(){
  var c = makeCard(makePainting())
  CARDS.unshift(c)
  STAGE.appendChild(c.el)
  c.el.style.zIndex = 100
  document.getElementById("loader").style.display = "none"

  c.el.offsetWidth // commit the entering state before transitioning
  c.el.classList.remove("entering")
  layout()

  // drop paintings that slid off the pile
  while (CARDS.length > SHOW.pile+2){
    var old = CARDS.pop()
    STAGE.removeChild(old.el)
  }
  setTimeout(function(){
    paint(c,function(){
      setTimeout(function(){
        // generating blocks the page, so let the last frame show first
        whenRunning(function(){setTimeout(next,30)})
      },SHOW.hold*1000)
    })
  },900)
}

function startShow(){
  makeBG()
  STAGE = document.getElementById("stage")
  window.addEventListener("resize",layout)
  document.addEventListener("keydown",function(e){
    if (e.code == "Space"){e.preventDefault();togglePause()}
  })
  setTimeout(next,100)
}

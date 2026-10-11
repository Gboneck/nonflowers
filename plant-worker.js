// Nonflowers plant worker
// Grows plants off the page's main thread. For a seed it returns the 2D
// painting, a thumbnail of it, a description of the specimen, and a 3D
// model rebuilt from the strokes the generator draws.

// main.js expects a page; give it just enough of one
self.window = self
self.document = {createElement:function(){return new OffscreenCanvas(300,150)}}
if (typeof NONFLOWERS_INLINE == "undefined"){importScripts("main.js")}
console.log = function(){}

vizParams = function(){}

// remember the parameters of the plant being grown
var LAST_PAR = null
var _genParams = genParams
genParams = function(){
  LAST_PAR = _genParams()
  return LAST_PAR
}

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
var THUMB = 256       // thumbnail size

// grow a plant from a seed: its painting on a sheet sized to fit the
// whole plant, and its strokes in sheet coordinates
function makePainting(seed){
  Math.seed(seed)
  Noise.noiseSeed(Math.floor(Math.random()*4294967296))
  var ppr = paper({col:PAPER_COL1})
  var target = Layer.empty(1)
  var kind
  Recorder.start(target)
  if (Math.random() <= 0.5){
    kind = "woody"
    woody({ctx:target})
  }else{
    kind = "herbal"
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

  // composite the plant onto paper the way the generator does
  var art = Layer.empty(S)
  art.fillStyle = "white"
  art.fillRect(0,0,S,S)
  for (var i = 0; i < S; i+= 512){
    for (var j = 0; j < S; j+= 512){
      art.drawImage(ppr,i,j);
    }
  }
  art.globalCompositeOperation = "multiply"
  rec.layers.forEach(function(l){art.drawImage(l.canvas,ox,oy)})
  art.globalCompositeOperation = "source-over"
  Layer.border(art,squircle(0.98,3))

  return {art:art,strokes:strokes,size:S,kind:kind,
    height:ymax-ymin,par:LAST_PAR}
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
  var lo = [Infinity,Infinity,Infinity], hi = [-Infinity,-Infinity,-Infinity]
  var gr, c
  function put(q){
    var k = gr.at++
    var v = [q[0]-S/2,S/2-q[1],q[2]]
    for (var d = 0; d < 3; d++){
      gr.pos[k*3+d] = v[d]
      if (v[d] < lo[d]){lo[d] = v[d]} if (v[d] > hi[d]){hi[d] = v[d]}
    }
    gr.col[k*4] = c[0]; gr.col[k*4+1] = c[1]; gr.col[k*4+2] = c[2]; gr.col[k*4+3] = c[3]
  }
  for (var i = 0; i < n; i++){
    var o = strokes[i]
    var p = o.pts
    var m = p.length
    gr = groups[kind(o)]
    c = parseRGBA(o.col)
    if (o.flat){
      // drawn only in the painting
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
    }else{
      for (var j = 0; j < m-1; j++){put(p[j]); put(p[j+1])}
    }
    for (var g = 0; g < 4; g++){groups[g].upto[i+1] = groups[g].at}
  }
  // a normal for each triangle, so the model can be lit
  for (var g = 0; g < 2; g++){
    var P = groups[g].pos
    var N = new Float32Array(P.length)
    for (var k = 0; k+8 < P.length; k += 9){
      var ax = P[k+3]-P[k], ay = P[k+4]-P[k+1], az = P[k+5]-P[k+2]
      var bx = P[k+6]-P[k], by = P[k+7]-P[k+1], bz = P[k+8]-P[k+2]
      var nx = ay*bz-az*by, ny = az*bx-ax*bz, nz = ax*by-ay*bx
      var l = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1
      for (var v = 0; v < 9; v += 3){
        N[k+v] = nx/l; N[k+v+1] = ny/l; N[k+v+2] = nz/l
      }
    }
    groups[g].nrm = N
  }
  if (!isFinite(lo[0])){lo = [0,0,0]; hi = [0,0,0]}
  var center = [0,1,2].map((d)=>((lo[d]+hi[d])/2))
  var radius = Math.max(50,Math.sqrt([0,1,2].reduce((s,d)=>(s+Math.pow((hi[d]-lo[d])/2,2)),0)))
  return {groups:groups,n:n,center:center,radius:radius,lo:lo,hi:hi}
}

// a small seeded random generator for naming, separate from the plant's
function namer(seed){
  var h = 2166136261
  var str = "name"+seed
  for (var i = 0; i < str.length; i++){h = Math.imul(h ^ str.charCodeAt(i),16777619)}
  return function(){
    h += 0x6D2B79F5
    var t = h
    t = Math.imul(t ^ t >>> 15,t | 1)
    t ^= t+Math.imul(t ^ t >>> 7,t | 61)
    return ((t ^ t >>> 14) >>> 0)/4294967296
  }
}

var GENUS_HEAD = ["Nona","Pseudo","Phanto","Umbra","Lumi","Vela","Nera","Calla",
  "Mira","Sola","Thala","Oro","Zephy","Aster","Myrio","Halo","Chlora","Peri"]
var GENUS_TAIL = ["anthus","phyllum","flora","cladus","stemon","petalum",
  "carpus","rhiza","sepala","stylis","bracta","thyrsus"]

// colour name and Latin epithet for a flower colour
function colourOf(col){
  var h = col.min[0], s = (col.min[1]+col.max[1])/2, v = (col.min[2]+col.max[2])/2
  if (s < 0.07){return v > 0.75 ? ["white","alba"] : ["grey","cinerea"]}
  if (h < 18 || h >= 340){return ["red","rubra"]}
  if (h < 45){return ["orange","aurantiaca"]}
  if (h < 70){return ["yellow","lutea"]}
  if (h < 160){return ["green","viridiflora"]}
  if (h < 250){return ["blue","caerulea"]}
  if (h < 290){return ["violet","violacea"]}
  return ["pink","rosea"]
}

// a specimen label: name and searchable traits
function describe(seed,p){
  var r = namer(seed)
  var genus = GENUS_HEAD[Math.floor(r()*GENUS_HEAD.length)]
    +GENUS_TAIL[Math.floor(r()*GENUS_TAIL.length)]
  var PAR = p.par
  var colour = colourOf(PAR.flowerColor)
  var habit = (p.kind == "woody") ? "shrub" : "herb"
  var petals = PAR.flowerPetal
  var leaves = (PAR.leafChance == 0) ? "leafless" : "leafy"
  var epithet = colour[1]
  if (r() < 0.35){epithet = (p.kind == "woody") ? "arborescens" : ["gracilis","nutans","elegans"][Math.floor(r()*3)]}
  var hsv = PAR.flowerColor.min
  return {
    name:genus+" "+epithet,
    habit:habit,
    colour:colour[0],
    petals:petals,
    leaves:leaves,
    height:Math.round(p.height*0.08),
    swatch:[hsv[0],hsv[1],hsv[2]],
  }
}

function grow(seed){
  var p = makePainting(seed)
  var model = buildModel(p.strokes,p.size)
  var thumb = new OffscreenCanvas(THUMB,THUMB)
  thumb.getContext("2d").drawImage(p.art.canvas,0,0,THUMB,THUMB)
  var msg = {
    seed:seed,
    meta:describe(seed,p),
    size:p.size,
    model:model,
    art:p.art.canvas.transferToImageBitmap(),
    thumb:thumb.transferToImageBitmap(),
  }
  var transfer = [msg.art,msg.thumb]
  model.groups.forEach(function(g){
    transfer.push(g.pos.buffer,g.col.buffer,g.upto.buffer)
    if (g.nrm){transfer.push(g.nrm.buffer)}
  })
  return {msg:msg,transfer:transfer}
}

onmessage = function(e){
  var seed = e.data.seed
  try{
    var r = grow(seed)
    postMessage(r.msg,r.transfer)
  }catch(err){
    postMessage({seed:seed,error:String(err && err.stack || err)})
  }
}

# Nonflowers

Procedurally generated paintings of nonexistent flowers in Gongbi style for the browser. Generate your own online at https://lingdong-.github.io/nonflowers/.

## Sample Output

![Screenshot1](/screenshots/screen01.jpg?raw=true "")


## Herbarium explorer

Open `explorer.html` (or click the flower icon on the main page) to browse a growing collection of nonflowers. A strip of specimen cards along the bottom shows each plant's painting; the selected specimen grows as a 3D model above it that turns slowly. Drag to turn it, scroll or pinch to zoom, double-click to reset, and switch to "Painting" to see the 2D painting. Search by name, colour, habit (shrub or herb), petal count or seed, or type a seed number to grow that exact plant. Star favourites (the ☆ next to the name, or the S key) and show only those with "Starred only". The collection and stars are kept in your browser, and a link ending in `#seed-123456` opens that specimen.

Plants are grown in background workers (`plant-worker.js`) from seeds, so every specimen can be grown again exactly. The 3D models are rebuilt from the generator's own 3D geometry and drawn with [three.js](https://threejs.org/), loaded from a CDN.

`slideshow.html` is an earlier version that grows one plant at a time and presses it into a painting.

## Description
Nonflowers is a piece of software that procedurally generate drawings of nonexistent flowers. It attempts to capture the fascinating structures of plants and the delicate brushstrokes in [Gongbi paintings](https://en.wikipedia.org/wiki/Gongbi) with mathematical functions and procedural noises. Through parameterization and randomization, the algorithm is capable of generating a large variety of original plants. It is written in Javascript and uses HTML canvas to render its output. All the graphics are computed with polygons or using pixel-level manipulations, thus no preexisting asset or external library is used.

A full description of the project can be found [here](https://drive.google.com/file/d/1g1gVmRKdn4He0fgavvKt54tb6HmMYANU/view).

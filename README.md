# Nonflowers

Procedurally generated paintings of nonexistent flowers in Gongbi style for the browser. Generate your own online at https://lingdong-.github.io/nonflowers/.

## Sample Output

![Screenshot1](/screenshots/screen01.jpg?raw=true "")


## Slideshow

Open `slideshow.html` (or click the slideshow icon on the main page) to watch an endless series of nonflowers grow as 3D models that turn in space. Stems are round tubes. Each finished plant is pressed flat into a sheet of paper sized to fit the whole plant, where it becomes the painting, and is then pushed aside onto a pile before the next one grows. Press space to pause. The 3D view uses [three.js](https://threejs.org/), loaded from a CDN. URL options: `grow`, `spin` and `press` (seconds for each stage, defaults 10, 5 and 3), `hold` (seconds a finished painting rests, default 3) and `pile` (paintings kept on the pile, default 4), e.g. `slideshow.html?grow=14&spin=8`.

## Description
Nonflowers is a piece of software that procedurally generate drawings of nonexistent flowers. It attempts to capture the fascinating structures of plants and the delicate brushstrokes in [Gongbi paintings](https://en.wikipedia.org/wiki/Gongbi) with mathematical functions and procedural noises. Through parameterization and randomization, the algorithm is capable of generating a large variety of original plants. It is written in Javascript and uses HTML canvas to render its output. All the graphics are computed with polygons or using pixel-level manipulations, thus no preexisting asset or external library is used.

A full description of the project can be found [here](https://drive.google.com/file/d/1g1gVmRKdn4He0fgavvKt54tb6HmMYANU/view).

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { PNG } from 'pngjs';

// Code-owned artwork: an angular A / upward flight mark. Keep template and demo
// assets identical, and rasterize without platform tools or network dependencies.
const root = fileURLToPath(new URL('../', import.meta.url));
const outline = [[512,260],[776,764],[638,764],[583,650],[441,650],[386,764],[248,764]];
const counter = [[512,414],[476,538],[548,538]];
const path = 'M512 260L776 764H638L583 650H441L386 764H248Z M512 414L476 538H548Z';
function inside(x,y,points) {
  let hit = false;
  for (let i=0,j=points.length-1;i<points.length;j=i++) {
    const [ax,ay]=points[i], [bx,by]=points[j];
    if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) hit=!hit;
  }
  return hit;
}
function raster(dark, tinted = false) {
  const image = new PNG({width:1024,height:1024});
  for(let y=0;y<1024;y++) for(let x=0;x<1024;x++) {
    let coverage=0;
    for(const sy of [0.25,0.75]) for(const sx of [0.25,0.75]) {
      if(inside(x+sx,y+sy,outline) && !inside(x+sx,y+sy,counter)) coverage+=0.25;
    }
    const amount=(x+y)/2048;
    const top=tinted?[20,20,20]:dark?[21,31,57]:[74,118,255];
    const bottom=tinted?top:dark?[8,14,32]:[34,57,170];
    const foreground=tinted?[245,245,245]:dark?[181,210,255]:[255,255,255];
    const index=(y*1024+x)*4;
    for(let c=0;c<3;c++) image.data[index+c]=Math.round((top[c]+(bottom[c]-top[c])*amount)*(1-coverage)+foreground[c]*coverage);
    image.data[index+3]=255;
  }
  return PNG.sync.write(image,{colorType:2});
}
const light=raster(false), dark=raster(true), tinted=raster(false,true);
const vector=`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="1024" android:viewportHeight="1024"><group android:pivotX="512" android:pivotY="512" android:scaleX="0.8" android:scaleY="0.8"><path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="${path}"/></group></vector>\n`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs><linearGradient id="background" x2="1" y2="1"><stop stop-color="#4a76ff"/><stop offset="1" stop-color="#2239aa"/></linearGradient></defs><path fill="url(#background)" d="M0 0H1024V1024H0Z"/><path fill="white" fill-rule="evenodd" d="${path}"/></svg>\n`;
for(const directory of ['assets/icons','scripts/templates/app/assets/icons']) {
  const out=join(root,directory); mkdirSync(out,{recursive:true});
  for(const [name,data] of Object.entries({
    'app.png':light,'app-dark.png':dark,'app-tinted.png':tinted,
    'android-foreground.xml':vector,'android-monochrome.xml':vector,'app.svg':svg,
  })) writeFileSync(join(out,name),data);
}
console.log('Generated default app icons for the demo and create template.');

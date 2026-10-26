// 原創像素街景,與 studio 共用外框與三階色。
import { Bmp, outline, tone } from './core.js';
export const STREET_KIT = {};
const add=(key,w,h,paint)=>STREET_KIT[key]={w,h,tags:['街景'],make:(opts={})=>{const b=new Bmp(w,h);paint(b,opts);return outline(b);}};
const colors=['#a58d9a','#c59c83','#7d92b0','#9c80b8','#83abb4'];
for(const [i,id] of ['alley','shops','city','avenue','harbor'].entries()) {
 add('skyline_'+id,416,80,b=>{
  for(let x=0;x<416;x+=26){const h=15+(x*7+i*17)%48;b.rect(x,80-h,23,h,colors[i]);for(let y=84-h;y<75;y+=9)b.rect(x+5,y,3,3,'#f9e2a9');}
  if(id==='avenue'){b.oval(345,37,29,29,'#f9b3dd');b.oval(345,37,25,25,'#928ac3');for(let a=0;a<8;a++){const x=345+Math.cos(a*Math.PI/4)*27,y=37+Math.sin(a*Math.PI/4)*27;b.rect(x-3,y-3,6,6,'#ffe19c');}b.rect(343,37,4,43,'#e8d6ee');}
  if(id==='harbor'){b.rect(30,22,10,48,'#fff3de');b.rect(27,18,16,8,'#ed8493');b.rect(31,26,8,5,'#fff5a3');b.rect(0,70,416,10,'#579ec0');for(let x=0;x<416;x+=16)b.hline(x,74+(x%3),9,'#ade5ee');}
 });
 for(const [j,suffix] of ['a','b'].entries())add('neighbor_'+id+'_'+suffix,48,96,b=>{const t=tone(colors[i]);b.rect(0,0,48,96,t.mid);b.rect(0,0,5,96,t.hi);b.hline(0,95,48,t.lo);for(let y=12;y<96;y+=32)for(let x=10;x<45;x+=18){b.rect(x,y,12,18,t.lo);b.rect(x+2,y+2,8,13,j?'#ffdfae':'#b2dbea');}});
}
add('sidewalk',32,24,b=>{b.rect(0,0,32,24,'#c4bed0');for(let y=0;y<24;y+=8)b.hline(0,y,32,'#e8dfeb');b.vline(16,0,24,'#9e95ae');});
add('road',32,32,b=>{b.rect(0,0,32,32,'#555b73');b.rect(4,15,20,2,'#ffe6ab');});
add('street_lamp',16,48,b=>{b.rect(7,8,3,39,'#5a536d');b.rect(2,3,12,8,'#fff0ac');b.hline(1,2,14,'#625775');b.rect(4,45,9,3,'#756d87');});
add('tree',32,48,b=>{b.rect(14,20,5,28,'#936c61');b.oval(16,16,14,14,'#5b9b88');b.oval(12,11,9,9,'#8bc4a0');});
add('car',40,20,(b,{color='#f5a1b7'})=>{const t=tone(color);b.rect(2,8,36,9,t.mid);b.rect(9,2,21,10,t.hi);b.rect(12,4,14,6,'#a3d5eb');for(const x of [9,30])b.oval(x,17,4,3,'#494659');});
add('bus',64,28,b=>{b.rect(1,1,62,23,'#e8bc74');for(let x=5;x<60;x+=11)b.rect(x,4,8,10,'#a1d7e5');for(const x of [12,51])b.oval(x,24,5,4,'#494659');});
add('door_glass',24,40,b=>{b.rect(0,0,24,40,'#e6dcee');b.rect(3,2,18,37,'#81b6c9');b.vline(12,2,37,'#c8e6ee');b.rect(16,21,2,5,'#fff0be');});
add('cat',16,12,b=>{b.oval(8,7,6,4,'#e8b78d');b.rect(2,1,3,5,'#e8b78d');b.rect(10,1,3,5,'#e8b78d');b.px(5,5,'#514653');b.px(10,5,'#514653');});
add('power_pole',16,64,b=>{b.rect(7,0,3,64,'#847889');b.hline(0,10,16,'#544d68');b.hline(0,18,16,'#544d68');});
add('shop_awning',48,20,b=>{for(let x=0;x<48;x+=8)b.rect(x,0,8,17,x%16?'#fff0d9':'#de8b9c');b.hline(0,18,48,'#9d6a85');});
add('big_screen_out',48,32,b=>{b.rect(0,0,48,32,'#48435e');b.rect(3,3,42,25,'#92cbe0');b.oval(24,15,9,9,'#ffe5a8');});
add('neon_arrow',24,24,b=>{b.rect(2,9,15,6,'#ff9bd7');for(let i=0;i<9;i++)b.vline(14+i,3+i,18-i*2,'#ff9bd7');});
add('palm',24,48,b=>{b.rect(12,12,4,36,'#b18b6a');for(let i=0;i<5;i++)b.oval(12+(i-2)*4,10+Math.abs(i-2)*3,7,4,'#67a58e');});

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import gsap from 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js';

const canvas=document.querySelector('#terrain');
const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
renderer.outputColorSpace=THREE.SRGBColorSpace;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(38,canvas.clientWidth/canvas.clientHeight,.1,100);
camera.position.set(0,4.8,10.5);camera.lookAt(0,0,0);
const group=new THREE.Group();scene.add(group);
const n=100,size=12,positions=[],indices=[];
function height(x,z){return Math.sin(x*.7+z*.2)*.22+Math.cos(z*.55-x*.3)*.16+Math.sin(x*.22+z*.42)*.13;}
for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){let px=(x/n-.5)*size,pz=(z/n-.5)*size;positions.push(px,height(px,pz),pz);}
for(let z=0;z<n;z++)for(let x=0;x<n;x++){let a=z*(n+1)+x,b=a+1,c=a+n+1,d=c+1;indices.push(a,c,b,b,c,d);}
const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0x17242c,wireframe:true,transparent:true,opacity:.55}));group.add(mesh);
const dots=new THREE.Points(geo,new THREE.PointsMaterial({color:0xff4b0b,size:.025,transparent:true,opacity:.8}));group.add(dots);
const axes=new THREE.GridHelper(14,35,0xff4b0b,0x28343c);axes.position.y=-.48;axes.material.transparent=true;axes.material.opacity=.15;group.add(axes);
let mouseX=0,mouseY=0;window.addEventListener('pointermove',e=>{mouseX=(e.clientX/innerWidth-.5);mouseY=(e.clientY/innerHeight-.5)});
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function frame(){requestAnimationFrame(frame);if(!reduced){group.rotation.y+=.0008;group.rotation.z=THREE.MathUtils.lerp(group.rotation.z,mouseX*.035,.025);camera.position.x=THREE.MathUtils.lerp(camera.position.x,mouseX*.8,.025);camera.position.y=THREE.MathUtils.lerp(camera.position.y,4.8-mouseY*.3,.025);}renderer.render(scene,camera)}
frame();
function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(canvas);
gsap.from('.hero-copy>*',{y:24,opacity:0,duration:.8,stagger:.1,ease:'power3.out',delay:.15});
gsap.from('.hero-aside',{opacity:0,x:20,duration:1,delay:.6});
const menu=document.querySelector('.menu-toggle'),nav=document.querySelector('.topbar nav');
menu.addEventListener('click',()=>{let open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false')}));
document.querySelector('#year').textContent=new Date().getFullYear();

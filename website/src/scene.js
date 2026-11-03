import * as THREE from 'three';
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function terrainScene(canvas,story=false){
 if(!canvas)return null;
 const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:innerWidth>700,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,story?1.4:1.6));renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x08090b,.035);
 const camera=new THREE.PerspectiveCamera(45,canvas.clientWidth/canvas.clientHeight,.1,120);camera.position.set(0,story?5:7,story?11:14);
 const group=new THREE.Group();scene.add(group);
 const N=story?100:90, geo=new THREE.PlaneGeometry(22,22,N,N);geo.rotateX(-Math.PI/2);
 const p=geo.attributes.position;
 for(let i=0;i<p.count;i++){let x=p.getX(i),z=p.getZ(i);p.setY(i,(Math.sin(x*.48)*Math.cos(z*.37)*.65+Math.sin((x+z)*.22)*.4+Math.cos(z*.8+x*.15)*.18));}
 geo.computeVertexNormals();
 const mat=new THREE.MeshStandardMaterial({color:0x151b22,metalness:.25,roughness:.72,wireframe:true,transparent:true,opacity:.58});
 const mesh=new THREE.Mesh(geo,mat);group.add(mesh);
 const pointsGeo=new THREE.BufferGeometry();const pts=[];
 for(let i=0;i<1800;i++){let x=(Math.random()-.5)*22,z=(Math.random()-.5)*22,y=Math.sin(x*.48)*Math.cos(z*.37)*.65+Math.sin((x+z)*.22)*.4+Math.cos(z*.8+x*.15)*.18;pts.push(x,y+.025,z);}
 pointsGeo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
 const points=new THREE.Points(pointsGeo,new THREE.PointsMaterial({color:0xff4b0b,size:.035,transparent:true,opacity:.72}));group.add(points);
 const grid=new THREE.GridHelper(28,50,0xff4b0b,0x272a30);grid.position.y=-1.2;grid.material.transparent=true;grid.material.opacity=.17;scene.add(grid);
 scene.add(new THREE.HemisphereLight(0xb9c8d8,0x151016,1.6));const light=new THREE.DirectionalLight(0xff5b25,2);light.position.set(-5,8,4);scene.add(light);
 let mx=0,my=0,scroll=0;canvas.addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();mx=(e.clientX-r.left)/r.width-.5;my=(e.clientY-r.top)/r.height-.5;});
 if(story)window.addEventListener('posEye:story',e=>scroll=e.detail.progress);
 const clock=new THREE.Clock();let raf;
 function resize(){const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
 const ro=new ResizeObserver(resize);ro.observe(canvas);
 function frame(){raf=requestAnimationFrame(frame);const t=clock.getElapsedTime();if(!reduced){group.rotation.y+=(mx*.12-group.rotation.y)*.025;group.rotation.x+=(-my*.035-group.rotation.x)*.025;mesh.material.opacity=.48+Math.sin(t*.4)*.06;}
 if(story){camera.position.set(Math.sin(scroll*6)*2.5,4.8-scroll*2.5,12-scroll*5);camera.lookAt(0,scroll*1.3,0);group.rotation.y=scroll*1.4;points.material.size=.035+scroll*.018;grid.position.z=-scroll*3;}
 else{camera.lookAt(0,0,0);group.rotation.y+=reduced?0:.0005;}
 renderer.render(scene,camera);}
frame();return()=>{cancelAnimationFrame(raf);ro.disconnect();renderer.dispose();};
}
terrainScene(document.querySelector('#world'));
terrainScene(document.querySelector('#story-canvas'),true);

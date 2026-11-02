import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import './scene.css';
gsap.registerPlugin(ScrollTrigger);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const loader=document.querySelector('.loader');document.body.classList.add('loading');
const lenis=reduced?null:new Lenis({duration:1.15,smoothWheel:true});
if(lenis){lenis.on('scroll',ScrollTrigger.update);gsap.ticker.add(t=>lenis.raf(t*1000));gsap.ticker.lagSmoothing(0)}
window.addEventListener('load',()=>{setTimeout(()=>{loader?.classList.add('done');document.body.classList.remove('loading');if(!reduced)gsap.from('.hero-content>*',{y:25,opacity:0,duration:.9,stagger:.1,ease:'power3.out'})},reduced?0:250)});
gsap.utils.toArray('.section-index,.manifesto-layout,.outputs-head,.output-card,.principle-row,.roadmap-intro,.roadmap-list>div').forEach(el=>gsap.from(el,{opacity:0,y:20,duration:.7,ease:'power2.out',scrollTrigger:{trigger:el,start:'top 86%',once:true}}));
const story=document.querySelector('.scroll-story'),chapters=[...document.querySelectorAll('.story-copy')],prog=document.querySelector('.story-progress span');
if(story)ScrollTrigger.create({trigger:story,start:'top top',end:'bottom bottom',onUpdate:s=>{const i=Math.min(3,Math.floor(s.progress*4));chapters.forEach((c,n)=>c.classList.toggle('active',n===i));if(prog)prog.style.height=((i+1)*25)+'%';document.dispatchEvent(new CustomEvent('posEye:story',{detail:{progress:s.progress,step:i}}))}});
const menu=document.querySelector('.menu'),nav=document.querySelector('.navlinks');menu?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open))});nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu?.setAttribute('aria-expanded','false')}));const year=document.querySelector('#year');if(year)year.textContent=new Date().getFullYear();

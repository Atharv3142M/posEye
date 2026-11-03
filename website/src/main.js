import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import './scene.js';
gsap.registerPlugin(ScrollTrigger);

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const loader = document.querySelector('.loader');
document.body.classList.add('loading');
const lenis = reduced ? null : new Lenis({duration:1.15,smoothWheel:true});
if(lenis){lenis.on('scroll',ScrollTrigger.update);gsap.ticker.add(t=>lenis.raf(t*1000));gsap.ticker.lagSmoothing(0);}
window.addEventListener('load',()=>{setTimeout(()=>{loader.classList.add('done');document.body.classList.remove('loading');intro();},reduced?0:450)});
function intro(){if(reduced)return;gsap.from('.hero-content>*',{y:28,opacity:0,duration:1,stagger:.12,ease:'power3.out',delay:.15});gsap.from('.hero-meta span',{opacity:0,y:10,duration:.8,stagger:.1,delay:.65});}
gsap.utils.toArray('.section-index,.manifesto-layout,.outputs-head,.output-card,.principle-row,.roadmap-intro,.roadmap-list>div').forEach(el=>gsap.from(el,{opacity:0,y:24,duration:.8,ease:'power2.out',scrollTrigger:{trigger:el,start:'top 86%',once:true}}));

const story=document.querySelector('.scroll-story'), chapters=[...document.querySelectorAll('.story-copy')], prog=document.querySelector('.story-progress span');
ScrollTrigger.create({trigger:story,start:'top top',end:'bottom bottom',onUpdate:self=>{let i=Math.min(3,Math.floor(self.progress*4));chapters.forEach((c,n)=>c.classList.toggle('active',n===i));prog.style.height=((i+1)*25)+'%';window.dispatchEvent(new CustomEvent('posEye:story',{detail:{progress:self.progress,step:i}}));}});
const menu=document.querySelector('.menu'), nav=document.querySelector('.navlinks');menu.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');menu.setAttribute('aria-expanded','false')}));
document.querySelector('#year').textContent=new Date().getFullYear();

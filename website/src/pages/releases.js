import { initNav } from '../components/nav.js';
import { initSearch } from '../components/search.js';
const API='https://api.github.com/repos/Atharv3142M/posEye/releases?per_page=20';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.addEventListener('DOMContentLoaded',()=>{
 initNav('releases');initSearch();const feed=document.querySelector('#releases-feed'),badge=document.querySelector('#releases-count-badge');if(!feed)return;
 const render=data=>{
 badge.textContent=data.length+' published releases';
 if(!data.length){feed.innerHTML='<article class="release-empty"><h2>No releases published yet</h2><p>Published GitHub release notes and assets will appear here automatically.</p><a class="btn btn-secondary" href="https://github.com/Atharv3142M/posEye/releases">Open GitHub Releases ↗</a></article>';return;}
 feed.innerHTML=data.map(r=>{
 const body=window.DOMPurify.sanitize(window.marked.parse(r.body||'_No release notes supplied._',{gfm:true}),{USE_PROFILES:{html:true}});
 const assets=(r.assets||[]).map(a=>'<a class="release-asset" href="'+esc(a.browser_download_url)+'" target="_blank" rel="noopener noreferrer"><span>↓</span><span><strong>'+esc(a.name)+'</strong><small>'+ (a.size/1048576).toFixed(1)+' MB · '+esc(a.download_count)+' downloads</small></span></a>').join('');
 return '<article class="release-card"><header class="release-meta"><span class="release-tag '+(r.prerelease?'pre':'')+'">'+(r.prerelease?'PRE-RELEASE':'RELEASE')+' · '+esc(r.tag_name)+'</span><time>'+new Date(r.published_at||r.created_at).toLocaleDateString()+'</time></header><h2>'+esc(r.name||r.tag_name)+'</h2><div class="markdown-body">'+body+'</div>'+(assets?'<section class="release-assets"><h3>Assets ('+(r.assets||[]).length+')</h3>'+assets+'</section>':'<p class="release-no-assets">No downloadable assets attached.</p>')+'<footer class="release-footer"><span>'+esc(r.target_commitish||'main')+'</span><a href="'+esc(r.html_url)+'" target="_blank" rel="noopener noreferrer">View release on GitHub ↗</a></footer></article>';
 }).join('');
 feed.querySelectorAll('pre').forEach(pre=>{const b=document.createElement('button');b.className='copy-code';b.textContent='Copy';b.type='button';b.onclick=async()=>{try{await navigator.clipboard.writeText(pre.querySelector('code')?.innerText||pre.innerText);b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1200)}catch{b.textContent='Select code'}};pre.append(b)});
 };
 fetch(API,{headers:{Accept:'application/vnd.github+json'}}).then(r=>{if(!r.ok)throw Error(r.status);return r.json()}).then(d=>render(Array.isArray(d)?d:[])).catch(()=>{badge.textContent='Feed unavailable';feed.innerHTML='<article class="release-empty"><h2>Unable to load release feed</h2><p>GitHub API unavailable or rate-limited. No release data is invented.</p><a class="btn btn-secondary" href="https://github.com/Atharv3142M/posEye/releases">Check GitHub Releases ↗</a></article>'});
});
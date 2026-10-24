// Bewegingsbibliotheek voor concept-ontwerpen. De ontwerp-agent schrijft geen JavaScript; hij zet data-attributen
// en schrijft zelf de CSS. Dit script (met nonce) doet de rest. Zonder JS of met prefers-reduced-motion blijft alles zichtbaar.
//
//  data-reveal[="links|rechts|schaal"]   → class is-zichtbaar zodra in beeld (CSS met .js-prefix schrijft het ontwerp)
//  data-scrub                             → woorden (span.w) krijgen .aan tijdens het scrollen
//  data-parallax="-0.08"                  → img/element schuift met snelheid t.o.v. scrollen (ouder: overflow hidden)
//  data-schaal="1.2"                      → beeld zoomt van 1.2 naar 1 tijdens het in beeld scrollen
//  data-onthul[="boven|links|cirkel"]     → clip-path opent tijdens het scrollen
//  data-tekenen                           → SVG-paden (stroke) tekenen zich tijdens het scrollen
//  data-verhaal / data-stap / data-toon / data-voortgang → scroll-verhaal (zie prompt)
//  data-horizontaal > [data-spoor]        → sectie blijft staan en het spoor schuift horizontaal (alleen ≥ 900px)
//  data-magneet                           → knop beweegt licht mee met de muis (alleen muis)
//  data-leesbalk                          → breedte = hoe ver de pagina gelezen is (scaleX)
//  --scroll (op <html>)                   → 0..1 voortgang van de hele pagina, bruikbaar in CSS
export const BEWEGING = String.raw`(function(){
var d=document,h=d.documentElement,W=window,rm=matchMedia("(prefers-reduced-motion: reduce)").matches;
function $$(s,r){return[].slice.call((r||d).querySelectorAll(s))}
function cl(x){return x<0?0:x>1?1:x}
var kop=d.querySelector("header");function k(){if(kop)kop.classList.toggle("is-gescrold",scrollY>8)}addEventListener("scroll",k,{passive:true});k();
if(rm||!("IntersectionObserver"in W))return;
h.classList.add("js");
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("is-zichtbaar");io.unobserve(e.target)}})},{rootMargin:"0px 0px -10% 0px",threshold:0});
$$("[data-reveal]").forEach(function(el){io.observe(el)});
var scrub=$$("[data-scrub]");
scrub.forEach(function(el){var tx=el.textContent.trim();el.setAttribute("aria-label",tx);el.innerHTML=tx.split(/\s+/).map(function(w){return'<span class="w" aria-hidden="true">'+w.replace(/[&<>]/g,"")+"</span>"}).join(" ")});
var par=$$("[data-parallax]"),sch=$$("[data-schaal]"),ont=$$("[data-onthul]"),tek=$$("[data-tekenen]"),hor=$$("[data-horizontaal]"),lees=$$("[data-leesbalk]"),verhalen=$$("[data-verhaal]");
tek.forEach(function(el){$$("path,line,polyline,circle,rect,ellipse",el).concat(el.tagName.toLowerCase()==="path"?[el]:[]).forEach(function(p){try{var l=p.getTotalLength();p.style.strokeDasharray=l;p.style.strokeDashoffset=l;p.__l=l}catch(e){}})});
function stap(v,el){if(el.classList.contains("is-actief"))return;$$("[data-stap]",v).forEach(function(s){s.classList.toggle("is-actief",s===el)});
var kl=getComputedStyle(el).getPropertyValue("--kleur").trim();if(kl)v.style.setProperty("--temp",kl);
var u=el.querySelector("use"),t=el.querySelector("h3,h2"),i=$$("[data-stap]",v).indexOf(el);v.setAttribute("data-actief",i+1);
$$('[data-toon="icoon"] use',v).forEach(function(x){if(u)x.setAttribute("href",u.getAttribute("href"))});
$$('[data-toon="titel"]',v).forEach(function(x){if(t)x.textContent=t.textContent});
$$('[data-toon="nummer"]',v).forEach(function(x){x.textContent=i+1});
$$("[data-voortgang]",v).forEach(function(x){x.style.strokeDashoffset=100-Number(el.dataset.stand||((i+1)/$$("[data-stap]",v).length*100))})}
function maat(){var breed=innerWidth>=900;hor.forEach(function(s){var sp=s.querySelector("[data-spoor]");if(!sp)return;var hd=null,n=sp.parentElement;while(n&&n!==s){if(getComputedStyle(n).position==="sticky"){hd=n;break}n=n.parentElement}var over=sp.scrollWidth-innerWidth;
// alleen horizontaal schuiven als er echt iets te schuiven valt; anders gewoon een normale sectie (geen leeg scherm op grote schermen)
if(breed&&over>innerWidth*.25){s.removeAttribute("data-horizontaal-uit");var hh=Math.min(innerHeight,sp.offsetHeight+Math.min(240,innerHeight*.25));if(hd&&hd!==s){hd.style.height=hh+"px";hd.style.top=Math.max(0,(innerHeight-hh)/2)+"px"}s.style.height=(over+hh)+"px"}
else{s.setAttribute("data-horizontaal-uit","");s.style.height="";sp.style.transform="";if(hd&&hd!==s){hd.style.height="";hd.style.top=""}}})}
var bezig=false;
function frame(){bezig=false;var vh=innerHeight,max=Math.max(1,h.scrollHeight-vh);h.style.setProperty("--scroll",(scrollY/max).toFixed(4));
lees.forEach(function(el){el.style.transform="scaleX("+(scrollY/max).toFixed(4)+")"});
par.forEach(function(el){var r=(el.parentElement||el).getBoundingClientRect();if(r.bottom<-200||r.top>vh+200)return;el.style.transform="translate3d(0,"+((r.top+r.height/2-vh/2)*Number(el.dataset.parallax||0)).toFixed(1)+"px,0)"});
sch.forEach(function(el){var r=(el.parentElement||el).getBoundingClientRect();if(r.bottom<0||r.top>vh)return;var p=cl((vh-r.top)/(vh*.9)),s0=Number(el.dataset.schaal||1.2);el.style.transform="scale("+(s0-(s0-1)*p).toFixed(4)+")"});
ont.forEach(function(el){var r=el.getBoundingClientRect();if(r.bottom<0||r.top>vh+50)return;var p=cl((vh-r.top)/(vh*.6)),m=el.dataset.onthul,c=(1-p)*62;
el.style.clipPath=m==="cirkel"?"circle("+(30+p*45).toFixed(1)+"% at 50% 50%)":m==="links"?"inset(0 "+c.toFixed(1)+"% 0 0)":"inset("+c.toFixed(1)+"% 0 0 0)"});
tek.forEach(function(el){var r=el.getBoundingClientRect();var p=cl((vh*.9-r.top)/(r.height+vh*.4));$$("path,line,polyline,circle,rect,ellipse",el).concat(el.tagName.toLowerCase()==="path"?[el]:[]).forEach(function(q){if(q.__l)q.style.strokeDashoffset=(q.__l*(1-p)).toFixed(1)})});
scrub.forEach(function(el){var r=el.getBoundingClientRect(),w=el.querySelectorAll(".w"),p=cl((vh*.85-r.top)/(r.height+vh*.35)),n=Math.round(p*w.length);for(var i=0;i<w.length;i++)w[i].classList.toggle("aan",i<n)});
if(innerWidth>=900)hor.forEach(function(s){var sp=s.querySelector("[data-spoor]");if(!sp||s.hasAttribute("data-horizontaal-uit"))return;var r=s.getBoundingClientRect(),af=s.offsetHeight-vh,p=af>0?cl(-r.top/af):0;sp.style.transform="translate3d("+(-p*(sp.scrollWidth-innerWidth)).toFixed(1)+"px,0,0)"});
verhalen.forEach(function(v){var best=null,bd=1e9;$$("[data-stap]",v).forEach(function(s){var r=s.getBoundingClientRect(),dd=Math.abs(r.top+r.height/2-vh*.5);if(dd<bd){bd=dd;best=s}});if(best)stap(v,best)})}
function req(){if(!bezig){bezig=true;requestAnimationFrame(frame)}}
addEventListener("scroll",req,{passive:true});addEventListener("resize",function(){maat();req()});addEventListener("load",function(){maat();req()});maat();frame();
if(matchMedia("(pointer:fine)").matches)$$("[data-magneet]").forEach(function(b){b.addEventListener("mousemove",function(e){var r=b.getBoundingClientRect();b.style.transform="translate("+((e.clientX-r.left-r.width/2)*.18).toFixed(1)+"px,"+((e.clientY-r.top-r.height/2)*.28).toFixed(1)+"px)"});b.addEventListener("mouseleave",function(){b.style.transform=""})});
})();`;

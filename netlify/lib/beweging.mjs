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
//  data-teller="35" [data-voor|data-na|data-decimalen] → telt op naar 35 zodra in beeld (inhoud = eindwaarde)
//  data-tabs > [data-tab=id] + [data-paneel=id]    → tabbladen (is-actief, hidden)
//  data-filter > [data-f=id|alle] + [data-cat="a b"] → filter (bijv. FAQ per onderwerp)
//  data-carrousel > [data-baan] > [data-slide], [data-vorige], [data-volgende], [data-stand] → vegen/knoppen met 01 / 06
//  data-rekenaar > [data-schuif=naam data-min/max/stap/start] (eigen schuifregelaar, --p = 0..1), [data-keuze=naam] > [data-optie=getal],
//     [data-waarde=naam], [data-uit="formule met namen + - * / ( )" data-voor data-na data-decimalen data-afronden data-max]
//  --scroll (op <html>)                   → 0..1 voortgang van de hele pagina, bruikbaar in CSS
export const BEWEGING = String.raw`(function(){
var d=document,h=d.documentElement,W=window,rm=matchMedia("(prefers-reduced-motion: reduce)").matches;
function $$(s,r){return[].slice.call((r||d).querySelectorAll(s))}
function cl(x){return x<0?0:x>1?1:x}
var kop=d.querySelector("header");function k(){if(kop)kop.classList.toggle("is-gescrold",scrollY>8)}addEventListener("scroll",k,{passive:true});k();
// Vaste actiebalk (mobiel) pas tonen als de bel/WhatsApp/mailknoppen op de pagina zelf uit beeld zijn, anders staat alles dubbel (besluit Maxim).
(function(){var bal=d.querySelector(".sm-actiebalk");if(!bal||!("IntersectionObserver"in W))return;
var kn=$$('main a[href^="tel:"],main a[href^="mailto:"],main a[href*="wa.me"],main a[href*="whatsapp"]').filter(function(a){return !bal.contains(a)&&!a.closest("header,footer,nav,.sm-balk")});
if(!kn.length)return;var zien=[];
if(!rm)bal.style.transition="translate .35s ease, opacity .35s ease";
function zet(){var uit=zien.length>0;bal.style.translate=uit?"0 140%":"";bal.style.opacity=uit?"0":"";bal.style.pointerEvents=uit?"none":"";if(uit)bal.setAttribute("aria-hidden","true");else bal.removeAttribute("aria-hidden")}
var o=new IntersectionObserver(function(es){es.forEach(function(e){var i=zien.indexOf(e.target);if(e.isIntersecting&&i<0)zien.push(e.target);if(!e.isIntersecting&&i>=0)zien.splice(i,1)});zet()},{threshold:0});
bal.style.translate="0 140%";bal.style.opacity="0";kn.forEach(function(a){o.observe(a)});})();
// --- Interactieve onderdelen (werken ook bij prefers-reduced-motion) ---
function num(v,f){var n=parseFloat(v);return isNaN(n)?f:n}
function fmt(n,dec){var p=n.toFixed(dec).replace(".",",").split(",");p[0]=p[0].replace(/\B(?=(\d{3})+(?!\d))/g,".");return p.join(",")}
function ev(s,v){var i=0;function sp(){while(s.charAt(i)===" ")i++}
function pr(){sp();if(s.charAt(i)==="("){i++;var x=ex();sp();i++;return x}var m=/^[0-9.]+|^[a-z_][a-z0-9_]*/i.exec(s.slice(i));if(!m)return 0;i+=m[0].length;return /^[0-9.]/.test(m[0])?parseFloat(m[0]):(v[m[0]]||0)}
function un(){sp();if(s.charAt(i)==="-"){i++;return -pr()}return pr()}
function te(){var x=un();for(;;){sp();var c=s.charAt(i);if(c==="*"){i++;x*=un()}else if(c==="/"){i++;var y=un();x=y?x/y:0}else return x}}
function ex(){var x=te();for(;;){sp();var c=s.charAt(i);if(c==="+"){i++;x+=te()}else if(c==="-"){i++;x-=te()}else return x}}
return ex()}
function klik(k,f){k.setAttribute("tabindex","0");k.setAttribute("role","button");k.addEventListener("click",function(e){e.preventDefault();f()});k.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();f()}})}
$$("[data-tabs]").forEach(function(c){var kn=$$("[data-tab]",c),pa=$$("[data-paneel]",c);
function kies(id){kn.forEach(function(k){var a=k.getAttribute("data-tab")===id;k.classList.toggle("is-actief",a);k.setAttribute("aria-pressed",a)});pa.forEach(function(p){var a=p.getAttribute("data-paneel")===id;p.classList.toggle("is-actief",a);p.hidden=!a})}
kn.forEach(function(k){klik(k,function(){kies(k.getAttribute("data-tab"))})});if(kn[0])kies(c.getAttribute("data-start")||kn[0].getAttribute("data-tab"))});
$$("[data-filter]").forEach(function(c){var kn=$$("[data-f]",c),it=$$("[data-cat]",c);
function kies(id){kn.forEach(function(k){var a=k.getAttribute("data-f")===id;k.classList.toggle("is-actief",a);k.setAttribute("aria-pressed",a)});it.forEach(function(i){i.hidden=!(id==="alle"||(" "+i.getAttribute("data-cat")+" ").indexOf(" "+id+" ")>-1)})}
kn.forEach(function(k){klik(k,function(){kies(k.getAttribute("data-f"))})});kies("alle")});
$$("[data-carrousel]").forEach(function(c){var t=c.querySelector("[data-baan]");if(!t)return;var sl=$$("[data-slide]",t),n=sl.length,tl=c.querySelector("[data-stand]");
function links(s){return s.getBoundingClientRect().left-t.getBoundingClientRect().left+t.scrollLeft}
function stand(){var b=0,bd=1e9;sl.forEach(function(s,j){var d=Math.abs(links(s)-t.scrollLeft);if(d<bd){bd=d;b=j}});if(tl)tl.textContent=(b<9?"0":"")+(b+1)+" / "+(n<10?"0":"")+n;return b}
function ga(j){j=(j+n)%n;t.scrollTo({left:links(sl[j]),behavior:rm?"auto":"smooth"})}
t.addEventListener("scroll",stand,{passive:true});stand();
$$("[data-volgende]",c).forEach(function(k){klik(k,function(){ga(stand()+1)})});$$("[data-vorige]",c).forEach(function(k){klik(k,function(){ga(stand()-1)})})});
$$("[data-rekenaar]").forEach(function(c){var v={};
function uit(){$$("[data-waarde]",c).forEach(function(e){if(e.hasAttribute("data-optie"))return;var n=e.getAttribute("data-waarde");if(n in v)e.textContent=(e.getAttribute("data-voor")||"")+fmt(v[n],num(e.getAttribute("data-decimalen"),0))+(e.getAttribute("data-na")||"")});
$$("[data-uit]",c).forEach(function(e){var x=ev(e.getAttribute("data-uit"),v);var r=num(e.getAttribute("data-afronden"),0);if(r>0)x=Math.round(x/r)*r;e.textContent=(e.getAttribute("data-voor")||"")+fmt(x,num(e.getAttribute("data-decimalen"),0))+(e.getAttribute("data-na")||"");var mx=num(e.getAttribute("data-max"),0);if(mx>0)e.style.setProperty("--p",cl(x/mx))})}
$$("[data-schuif]",c).forEach(function(s){var n=s.getAttribute("data-schuif"),mi=num(s.getAttribute("data-min"),0),ma=num(s.getAttribute("data-max"),100),st=num(s.getAttribute("data-stap"),1);
function zet(x){x=Math.min(ma,Math.max(mi,Math.round(x/st)*st));v[n]=x;var p=ma>mi?(x-mi)/(ma-mi):0;s.style.setProperty("--p",p);s.setAttribute("aria-valuenow",x);uit()}
s.setAttribute("role","slider");s.setAttribute("tabindex","0");s.setAttribute("aria-valuemin",mi);s.setAttribute("aria-valuemax",ma);s.style.touchAction="pan-y";
function vanx(e){var r=s.getBoundingClientRect();zet(mi+cl((e.clientX-r.left)/r.width)*(ma-mi))}
s.addEventListener("pointerdown",function(e){s.setPointerCapture(e.pointerId);s.setAttribute("data-sleep","");vanx(e)});
s.addEventListener("pointermove",function(e){if(s.hasAttribute("data-sleep"))vanx(e)});
s.addEventListener("pointerup",function(){s.removeAttribute("data-sleep")});s.addEventListener("pointercancel",function(){s.removeAttribute("data-sleep")});
s.addEventListener("keydown",function(e){var d=e.key==="ArrowRight"||e.key==="ArrowUp"?1:e.key==="ArrowLeft"||e.key==="ArrowDown"?-1:0;if(d){e.preventDefault();zet(v[n]+d*st)}});
zet(num(s.getAttribute("data-start"),mi))});
$$("[data-keuze]",c).forEach(function(g){var n=g.getAttribute("data-keuze"),op=$$("[data-optie]",g);
function kies(o){op.forEach(function(x){var a=x===o;x.classList.toggle("is-actief",a);x.setAttribute("aria-pressed",a)});v[n]=num(o.getAttribute("data-optie"),0);uit()}
op.forEach(function(o){klik(o,function(){kies(o)})});if(op.length)kies($$("[data-optie].is-actief",g)[0]||op[0])});
uit()});
$$("[data-teller]").forEach(function(el){var t=num(el.getAttribute("data-teller"),0),dec=num(el.getAttribute("data-decimalen"),0),pre=el.getAttribute("data-voor")||"",na=el.getAttribute("data-na")||"";
function zet(x){el.textContent=pre+fmt(x,dec)+na}
if(rm||!("IntersectionObserver"in W)){zet(t);return}
var o=new IntersectionObserver(function(es){if(!es[0].isIntersecting)return;o.disconnect();var s=null;function f(ts){if(s===null)s=ts;var p=cl((ts-s)/1600);p=1-Math.pow(1-p,3);zet(t*p);if(p<1)requestAnimationFrame(f)}zet(0);requestAnimationFrame(f)},{threshold:.4});o.observe(el)});
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

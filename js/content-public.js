/* CMS publik Nusa East: konten dari API, struktur dan styling tetap di source code. */
(() => {
  const API = "https://nusa-east-vsxf.vercel.app/api/content/public";
  const get = async (path) => { const r = await fetch(`${API}/${path}`); if (!r.ok) throw new Error("CMS unavailable"); return r.json(); };
  const setText = (el, value) => { if (el && value != null) el.textContent = value; };
  const setImage = (el, value, alt) => { if (el && value) { el.src = /^https?:\/\//i.test(value) ? value : `https://nusa-east-vsxf.vercel.app${value}`; if (alt) el.alt = alt; } };
  async function hero() {
    const data = await get("hero"); if (!data) return;
    const section = document.querySelector(".hero"); if (!section) return;
    setText(section.querySelector("h1"), data.title);
    setText(section.querySelector(".hero-copy > p"), data.subtitle);
    const button = section.querySelector(".hero-actions a");
    if (button) { setText(button, data.button_text); if (data.button_link) button.href = data.button_link; }
    setImage(section.querySelector(".hero-visual img"), data.image, data.title);
    section.hidden = data.is_active === false;
  }
  async function about() {
    const data = await get("about"); if (!data) return;
    const section = document.querySelector("body > section.section"); if (!section) return;
    setText(section.querySelector("h1"), data.title);
    const ps = section.querySelectorAll(".grid-2 p");
    if (ps[0]) setText(ps[0], data.subtitle || data.content);
    if (ps[1]) setText(ps[1], data.content);
    setImage(section.querySelector(".grid-2 img"), data.image, data.title);
    if (data.vision || data.mission) {
      let block = document.getElementById("cms-vision-mission");
      if (!block) { block=document.createElement("div"); block.id="cms-vision-mission"; block.className="grid-2 mt-40"; section.querySelector(".container")?.append(block); }
      block.textContent="";
      for (const [label,value] of [["Visi",data.vision],["Misi",data.mission]]) if(value) {
        const card=document.createElement("div"); card.className="card";
        const h=document.createElement("h3"); h.textContent=label;
        const p=document.createElement("p"); p.textContent=value; card.append(h,p); block.append(card);
      }
    }
  }
  if (document.querySelector(".hero")) hero().catch(()=>{});
  if (/about\.html$/i.test(location.pathname)) about().catch(()=>{});
})();
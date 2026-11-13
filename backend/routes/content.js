"use strict";
const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const pool = require("../db/pool");
const { requireSuper } = require("../middleware/auth");
const router = express.Router();
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, f, cb) => cb(null, ["image/jpeg","image/png","image/webp","image/gif"].includes(f.mimetype)) });
const slugify = s => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\s-]/g,"").trim().replace(/[\s-]+/g,"-").slice(0,255);
const allowed = {
  articles: {
    fields: ["title", "slug", "content", "image", "author", "is_published"]
  },
  terms_and_conditions: {
    fields: ["title", "slug", "content", "image", "author"]
  },
  privacy_policies: {
    fields: ["title", "slug", "content", "image", "author"]
  },
  hero_sections: {
    fields: ["title", "subtitle", "image", "button_text", "button_link", "is_active"]
  },
  about_sections: {
    fields: ["title", "subtitle", "content", "image", "vision", "mission"]
  }
};

function sanitizeArticleHtml(value) {
  return String(value ?? "")
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, '$1="#"')
    .replace(/<\s*meta[^>]*>/gi, "");
}

const wrap = fn => async (req,res) => {
  try { await fn(req,res); }
  catch(e) {
    console.error("CMS:",e.message);
    res.status(e.status || (e.code==="23505"?409:500)).json({error:e.status||e.code==="23505" ? (e.message || "Slug sudah digunakan.") : "Operasi konten gagal."});
  }
};

function clean(table, body) {
  const fields = allowed[table].fields;
  const out = {};

  for (const f of fields) {
    if (body[f] !== undefined) {
      out[f] = body[f];
    }
  }

  if (out.title !== undefined) {
    out.title = String(out.title).trim().slice(0, 255);
  }

  if (out.slug !== undefined) {
    out.slug = slugify(out.slug);
  }

  if (out.author !== undefined) {
    out.author = String(out.author).trim().slice(0, 150);
  }

  // Memproses isi konten dan URL gambar
  for (const f of [
    "content",
    "subtitle",
    "vision",
    "mission",
    "image",
    "button_text",
    "button_link"
  ]) {
    if (out[f] !== undefined) {
      out[f] = String(out[f] ?? "").trim();
    }
  }

  if (table === "articles" && out.content !== undefined) out.content = sanitizeArticleHtml(out.content);

  // Memproses status publikasi dan aktivasi
  for (const f of ["is_active", "is_published"]) {
    if (out[f] !== undefined) {
      out[f] = out[f] === true || out[f] === "true";
    }
  }

  return out;
}

async function list(table,publicOnly=false) {
  const where=publicOnly&&table==="articles"?"WHERE is_published=true":publicOnly&&table==="hero_sections"?"WHERE is_active=true":"";
  return (await pool.query(`SELECT * FROM public.${table} ${where} ORDER BY updated_at DESC,id DESC`)).rows;
}
router.post("/upload", requireSuper, imageUpload.single("image"), wrap(async(req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "Pilih gambar JPG, PNG, WEBP, atau GIF."
    });
  }

  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO public.content_media
    (id, file_name, mime_type, image_data)
    VALUES ($1, $2, $3, $4)`,
    [
      id,
      req.file.originalname.slice(0, 255),
      req.file.mimetype,
      req.file.buffer
    ]
  );

  res.json({
    image: `https://nusa-east-vsxf.vercel.app/api/content/media/${id}`
  });
}));

router.get("/media/:id",wrap(async(req,res)=>{
  if(!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(404).end();
  const r=await pool.query("SELECT mime_type,image_data FROM public.content_media WHERE id=$1",[req.params.id]);
  if(!r.rowCount) return res.status(404).end();
  res.set("Content-Type",r.rows[0].mime_type);res.set("Cache-Control","public,max-age=31536000,immutable");res.send(r.rows[0].image_data);
}));
router.get("/public/articles",wrap(async(_req,res)=>res.json(await list("articles",true))));
router.get("/public/articles/:slug",wrap(async(req,res)=>{
  const r=await pool.query("SELECT * FROM public.articles WHERE slug=$1 AND is_published=true",[req.params.slug]);
  if(!r.rowCount) return res.status(404).json({error:"Artikel tidak ditemukan."});res.json(r.rows[0]);
}));
router.get("/public/hero",wrap(async(_req,res)=>res.json((await list("hero_sections",true))[0]||null)));
router.get("/public/about",wrap(async(_req,res)=>res.json((await list("about_sections",true))[0]||null)));
router.get("/public/legal/:kind",wrap(async(req,res)=>{
  const table=req.params.kind==="terms"?"terms_and_conditions":req.params.kind==="privacy"?"privacy_policies":null;
  if(!table) return res.status(404).json({error:"Halaman tidak ditemukan."});
  res.json((await list(table))[0]||null);
}));
router.use(requireSuper);
router.get("/:table",wrap(async(req,res)=>{
  const t=req.params.table;if(!allowed[t])return res.status(404).json({error:"Jenis konten tidak dikenal."});
  const rows = await list(t);
  res.json(["terms_and_conditions","privacy_policies","hero_sections","about_sections"].includes(t) ? rows.slice(0,1) : rows);
}));
router.post("/:table",wrap(async(req,res)=>{
  const t=req.params.table;if(!allowed[t])return res.status(404).json({error:"Jenis konten tidak dikenal."});
  if (["terms_and_conditions","privacy_policies","hero_sections","about_sections"].includes(t)) return res.status(405).json({error:"Bagian ini merupakan konten tetap. Gunakan Edit untuk memperbarui data yang sudah ada."});
  const d=clean(t,req.body);
  if(!d.title && !["hero_sections","about_sections"].includes(t))return res.status(400).json({error:"Judul wajib diisi."});
  if(["articles","terms_and_conditions","privacy_policies"].includes(t)&&!d.content)return res.status(400).json({error:"Isi konten wajib diisi."});
  if(d.title&&!d.slug&&["articles","terms_and_conditions","privacy_policies"].includes(t))d.slug=slugify(d.title);
  if(["articles","terms_and_conditions","privacy_policies"].includes(t)&&!d.slug)return res.status(400).json({error:"Slug tidak valid."});
  const keys=Object.keys(d);if(!keys.length)return res.status(400).json({error:"Tidak ada data."});
  const vals=keys.map(k=>d[k]),cols=keys.join(","),marks=keys.map((_,i)=>`$${i+1}`).join(",");
  const r=await pool.query(`INSERT INTO public.${t}(${cols}) VALUES(${marks}) RETURNING *`,vals);res.status(201).json(r.rows[0]);
}));
router.put("/:table/:id",wrap(async(req,res)=>{
  const t=req.params.table;if(!allowed[t])return res.status(404).json({error:"Jenis konten tidak dikenal."});
  const d=clean(t,req.body);
  if(d.title&&!d.slug&&["articles","terms_and_conditions","privacy_policies"].includes(t))d.slug=slugify(d.title);
  const keys=Object.keys(d);if(!keys.length)return res.status(400).json({error:"Tidak ada perubahan."});
  const set=keys.map((k,i)=>`${k}=$${i+1}`).join(","),vals=keys.map(k=>d[k]);vals.push(req.params.id);
  const r=await pool.query(`UPDATE public.${t} SET ${set},updated_at=now() WHERE id=$${vals.length} RETURNING *`,vals);
  if(!r.rowCount)return res.status(404).json({error:"Konten tidak ditemukan."});res.json(r.rows[0]);
}));
router.delete("/:table/:id",wrap(async(req,res)=>{
  const t=req.params.table;if(!allowed[t])return res.status(404).json({error:"Jenis konten tidak dikenal."});
  if (["terms_and_conditions","privacy_policies","hero_sections","about_sections"].includes(t)) return res.status(405).json({error:"Konten tetap tidak dapat dihapus."});
  const r=await pool.query(`DELETE FROM public.${t} WHERE id=$1 RETURNING id`,[req.params.id]);
  if(!r.rowCount)return res.status(404).json({error:"Konten tidak ditemukan."});res.json({success:true});
}));
module.exports=router;

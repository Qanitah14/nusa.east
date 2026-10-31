/* =========================================================
   NUSA EAST — BRAND STYLE MATCHER LOGIC
   ========================================================= */

function initBrandMatcher() {
  const box = document.getElementById("quizBox");
  const questions = NUSAEAST_DATA.brandMatcherQuiz;
  let current = 0;
  const scores = {};

  function renderQuestion() {
    const q = questions[current];
    const progress = Math.round((current / questions.length) * 100);
    box.innerHTML = `
      <div class="quiz-progress"><div class="quiz-progress-bar" style="width:${progress}%"></div></div>
      <p class="eyebrow">Pertanyaan ${current + 1} dari ${questions.length}</p>
      <h3 class="mb-24">${q.q}</h3>
      <div id="optionList"></div>
    `;
    const optionList = document.getElementById("optionList");
    q.options.forEach(opt => {
      const btn = document.createElement("button");
      btn.className = "quiz-option";
      btn.textContent = opt.text;
      btn.addEventListener("click", () => {
        scores[opt.style] = (scores[opt.style] || 0) + 1;
        current++;
        if (current < questions.length) {
          renderQuestion();
        } else {
          renderResult();
        }
      });
      optionList.appendChild(btn);
    });
  }

  function renderResult() {
    const topStyle = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
    const result = NUSAEAST_DATA.brandStyleResults[topStyle];
    box.innerHTML = `
      <div class="result-box">
        <span class="eyebrow">Gaya Brand Kamu</span>
        <h2>${topStyle}</h2>
        <div class="palette-swatches flex-center">
          ${result.palette.map(c => `<span style="background:${c}"></span>`).join("")}
        </div>
        <p style="max-width:440px; margin:0 auto;">${result.desc}</p>
        <div class="hero-actions flex-center mt-24">
          <a href="packages.html#brand" class="btn btn-primary">Lihat Paket Brand Development</a>
          <button class="btn btn-outline" onclick="location.reload()">Ulangi Kuis</button>
        </div>
      </div>
    `;
  }

  renderQuestion();
}

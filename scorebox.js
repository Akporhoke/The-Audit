pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
  const predictionBox = document.getElementById("prediction");
  const realScore = document.getElementById("saved");
  const sub = document.getElementById("sub");

  // NOTE: the old click listener on #return-home has been removed from
  // here. It was duplicating guess.js's own SAVE handler and firing in
  // the same click event, immediately hiding #G-scoreB (the popup's
  // parent) right after guess.js made the popup visible — so the popup
  // never had a chance to actually show. That reveal logic now lives
  // inside guess.js's closeAll(), which runs after the popup's timer
  // finishes (or Skip is pressed) instead of immediately on click.

  // Watch realScore for changes from other JS
  const observer = new MutationObserver(() => {
    console.log('realScore changed:', realScore.innerHTML);

    if (Number(realScore.innerHTML) >= -1) {
      predictionBox.style.opacity = '0';
      setTimeout(() => {
        predictionBox.style.display = 'none';
        sub.style.display = 'none';
      }, 600);
    }
  });

  observer.observe(realScore, {
    childList: true,
    characterData: true,
    subtree: true
  });

  // Double click to dismiss prediction box
  predictionBox.addEventListener('dblclick', () => {
    predictionBox.style.opacity = '0';
    setTimeout(() => {
      predictionBox.style.display = 'none';
    }, 600);
  });
});

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
  const predicted = document.getElementById("return-home");
  const gScoreC = document.getElementById('G-scoreB');
  const fullBody = document.getElementById("body");
  const numberDisplay = document.getElementById("numberDisplay");
  const predictionBox = document.getElementById("prediction");
  const realScore = document.getElementById("saved");
  const sub = document.getElementById("sub");
  
  // Return home button
  if (predicted && gScoreC && fullBody) {
    predicted.addEventListener('click', () => {
      gScoreC.style.display = 'none';
      fullBody.style.display = 'block';
      
      if (Number(numberDisplay.innerHTML) >= 0) {
        predictionBox.style.display = 'block';
        predictionBox.style.opacity = '1';
        predictionBox.innerHTML = numberDisplay.innerHTML;
      }
    });
  }
  
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
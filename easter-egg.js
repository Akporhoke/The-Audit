let clickCount = 0;
document.getElementById('red-circle').addEventListener('click', () => {
  clickCount++;
  if (clickCount === 5) {
    alert('🎉 Government or No Government Ishakike must survive');
    clickCount = 0;
  }
});


// Double-tap the logo to change the quote
document.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('#main');
  const quoteText = document.querySelector('#mini-card p');
  
  // Array of quotes to rotate through
  const quotes = [
    "A budget is the bridge between your current income and your future wealth.",
    "Every dollar saved is a dollar earned twice.",
    "Wealth isn't about how much you make, it's about how much you keep.",
    "The best investment you can make is in yourself.",
    "Don't look at your feet, or you'll never see what is ahead.",
    "A genuine estimator of money is one who lives within it.",
    "Budgeting is telling your money where to go instead of wondering where it went."
  ];
  
  let currentIndex = 0;
  
  if (logo && quoteText) {
    logo.addEventListener('dblclick', () => {
      // Change to next quote
      currentIndex = (currentIndex + 1) % quotes.length;
      quoteText.textContent = quotes[currentIndex];
      
      // Add fade animation
      quoteText.style.animation = 'fadeQuote 0.5s ease';
      
      // Add animation CSS if not exists
      if (!document.getElementById('quote-anim')) {
        const style = document.createElement('style');
        style.id = 'quote-anim';
        style.textContent = `
          @keyframes fadeQuote {
            0% { opacity: 0; transform: translateY(-10px); }
            50% { opacity: 0.5; }
            100% { opacity: 1; transform: translateY(0); }
          }
        `;
        document.head.appendChild(style);
      }
      
      console.log(`Quote changed: ${currentIndex + 1}/${quotes.length}`);
    });
  }
});


let fastScroll = false;
let lastScroll = 0;

window.addEventListener('scroll', () => {
  const currentScroll = window.scrollY;
  if (currentScroll - lastScroll > 500) fastScroll = true;
  lastScroll = currentScroll;
});

document.getElementById('footer').addEventListener('click', () => {
  if (fastScroll) {
    alert('🚀 Quick downloader! Speed bonus activated! 🚀');
    fastScroll = false;
  }
});


let secretWord = '';
document.addEventListener('click', (e) => {
  const text = e.target.textContent || '';
  if (text.includes('A')) secretWord += 'A';
  if (secretWord === 'AUDIT') {
    alert('🎯 AUDIT MASTER! 🎯');
    secretWord = '';
  }
});


let footerTapCount = 0;
document.getElementById('footer').addEventListener('click', () => {
  footerTapCount++;
  if (footerTapCount === 3) {
    document.body.style.filter = 'hue-rotate(90deg)';
    setTimeout(() => document.body.style.filter = '', 5000);
    footerTapCount = 0;
  }
});


let isFlipped = false;

document.addEventListener('DOMContentLoaded', () => {
  const logo = document.querySelector('#main');
  
  if (logo) {
    logo.addEventListener('dblclick', () => {
      isFlipped = !isFlipped;
      
      document.body.style.transform = isFlipped ? 'rotateX(180deg)' : 'rotateX(0deg)';
      document.body.style.transition = 'transform 1s ease';
      
      console.log(isFlipped ? '🔄 Page flipped!' : '✅ Page restored!');
    });
  }
});
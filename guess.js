const sub = document.getElementById('sub');
const gScore = document.getElementById('G-score');
const gScoreB = document.getElementById('G-scoreB');
const gScoreBCss = document.querySelector('#G-scoreB');
const body = document.querySelector('#body');
const cancelBtn = document.getElementById('cancel-btn');

cancelBtn.addEventListener('click', () => {
    gScoreBCss.style.display = 'none';
    body.style.display = 'block';
});

sub.addEventListener('click', () => {
    gScoreBCss.style.display = 'block';
    body.style.display = 'none';
});


let currentNumber = -1;
const min = 0;
const max = 10;

const numberDisplay = document.getElementById('numberDisplay');
const decreaseBtn = document.getElementById('decreaseBtn');
const increaseBtn = document.getElementById('increaseBtn');

function updateDisplay() {
    numberDisplay.textContent = currentNumber;
}

decreaseBtn.addEventListener('click', () => {
    if (currentNumber > min) {
        currentNumber--;
        updateDisplay();
    }
});

increaseBtn.addEventListener('click', () => {
    if (currentNumber < max) {
        currentNumber++;
        updateDisplay();
    }
});


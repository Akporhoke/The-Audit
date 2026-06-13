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
    console.log(body);
});


const decreaseBtn = document.getElementById('decreasebtn');
const increaseBtn = document.getElementById('increasebtn');
const numberDisplay = document.getElementById('numberdisplay');

decreaseBtn.addEventListener('click', () => {
    let currentValue = parseInt(numberDisplay.textContent, 10);
    numberDisplay.textContent = currentValue - 1;
});

increaseBtn.addEventListener('click', () => {
    let currentValue = parseInt(numberDisplay.textContent, 10);
    numberDisplay.textContent = currentValue + 1;
});

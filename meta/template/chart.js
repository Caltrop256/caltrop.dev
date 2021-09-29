const dfrom = document.getElementById('from');
const dto = document.getElementById('to');
const info = document.createElement('div');
info.style = `
    display: none;
    position: absolute;
    transition: all 250ms ease;
    background-color: black;
    border: 1px solid white;
    padding: 1px;
    border-radius: 3px;
    pointer-events: none;
`
info.innerHTML = '<p>Awesome</p>';
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
const script = document.querySelector('script[src="/meta/chart.js"]')
const parent = script.parentElement;
canvas.width = getComputedStyle(parent).getPropertyValue('width').slice(0, -2);
canvas.height = 720 / canvas.width * 312;
script.insertAdjacentElement('beforebegin', canvas);
script.insertAdjacentElement('beforebegin', info);

const bottom = canvas.height * 0.1;
const height = canvas.height - bottom;
const left = canvas.width * 0.035;
const width = canvas.width - left;

const ySteps = 5;
const xSteps = 10;

const colors = Math.random() > 0.25 ? [
    '#f7524a',
    '#f77b4a',
    '#ffef08',
    '#00b59c',
    '#009cd6',
    '#c6a5d6',
    '#b55ab5'
] : [
    '#47A9FA',
    '#F88BC2',
    '#ffffff',
    '#F88BC2',
    '#47A9FA'
];
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

let dataPairs = [];
let points = [];

const convertRange = (value, sourceRange, targetRange) => {
    return (value - sourceRange[0]) * (targetRange[1] - targetRange[0]) / (sourceRange[1] - sourceRange[0]) + targetRange[0];
}

let previousInd = -1;

function render() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const trueYMax = Math.ceil(Math.max.apply(null, dataPairs.map(d => d[1])));
    const pow = Math.pow(10, (trueYMax.toString().length - 1));

    const yMin = 0;
    const yMax = Math.max(ySteps, Math.ceil(trueYMax / pow) * pow);
    const xMin = (dataPairs[0] || [0])[0];
    const xMax = (dataPairs[dataPairs.length - 1] || [0])[0];

    ctx.lineWidth = 1;

    for(let i = 0; i <= ySteps; ++i) {
        const y = i / ySteps * (height - bottom) + bottom;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(width, y);
        ctx.closePath();
        ctx.strokeStyle = '#5b4e4e';
        ctx.stroke();

        ctx.font = '11px Arial';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right'
        ctx.strokeStyle = '#ffffff'
        ctx.strokeText(((ySteps - i) / ySteps * yMax) | 0, left - 2, y);
    }

    for(let i = 0; i <= xSteps; ++i) {
        const x = i / xSteps * (width - left) + left;
        ctx.beginPath();
        ctx.moveTo(x, bottom);
        ctx.lineTo(x, height);
        ctx.closePath();
        ctx.strokeStyle = '#433b3b';
        ctx.stroke();

        const date = new Date(convertRange(i, [0, xSteps], [xMin, xMax]));
        ctx.font = '11px Arial';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(date.getDate().toString().padStart(2, '0') + ' ' + months[date.getMonth()], x, height + 8);
    }

    points = dataPairs.map(d => [
        convertRange(d[0], [xMin, xMax], [left, width]),
        convertRange(yMax - d[1], [yMin, yMax], [bottom, height])
    ]);

    ctx.lineWidth = 3;

    for(let i = 0; i < points.length; ++i) {
        const clr = colors[(i / points.length * colors.length) | 0];

        if(i == previousInd) {
            ctx.beginPath();
            ctx.arc(points[i][0], points[i][1], 6, 0, Math.PI * 2);
            ctx.closePath();
            ctx.fillStyle = clr;
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.strokeStyle = clr;
            ctx.lineWidth = 3;
        }

        ctx.beginPath();
        if(i < points.length - 1) {
            ctx.moveTo(points[i][0], points[i][1]);
            ctx.lineTo(points[i+1][0], points[i+1][1]);
        } else if(points.length == 1) {
            ctx.moveTo(left, points[i][1])
            ctx.lineTo(width, points[i][1]);
        } else break;
        ctx.closePath();
        ctx.strokeStyle = clr;
        ctx.stroke();
    }
}

window.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX;
    const my = e.clientY;

    const outside = () => {if(previousInd != -1) {
        previousInd = -1;
        info.style.display = 'none';
        render();
    }};

    if(rect.left < mx && mx < rect.right && rect.top < my && my < rect.bottom) {
        const px = (Math.round(mx - rect.left) - left) / (width - left);
        if(px > 0 && px < 1) {
            const ind = (px * dataPairs.length) | 0;
            if(ind != previousInd && dataPairs.length) {
                previousInd = ind;
                info.style.display = 'block';
                const date = new Date(dataPairs[ind][0]);
                const dateString = date.getDate().toString().padStart(2, '0') + ' ' + months[date.getMonth()]
                info.innerHTML = `<p style="margin: 0; text-align: center;">${dataPairs[ind][1]}<br>${dateString}</p>`
                info.style.top = points[ind][1] + rect.top - (info.clientHeight * 0.8) + 'px';
                info.style.left = points[ind][0] + rect.left - (info.clientWidth * 1.1) + 'px';
                render();
            }
        } else outside();
    } else outside();
});

render();

function getData() {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '/api/anal/' + ((dfrom.value && dto.value) ? ('?t=' + dfrom.value + '_' + dto.value) : ''), true);
    xhr.addEventListener('readystatechange', function() {
        if(this.readyState == 4 && this.status == 200) {
            const data = JSON.parse(this.responseText);
            dataPairs = data.days;
            render();
        }
    });
    xhr.send(null);
};
getData();
dto.onchange = getData;
dfrom.onchange = getData;
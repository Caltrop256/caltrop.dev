let loading = true;
const info = document.createElement('div');
info.style = `
    display: none;
    position: absolute;
    transition: all 250ms ease-out;
    background-color: black;
    border: 1px solid white;
    padding: 1px;
    border-radius: 3px;
    pointer-events: none;
`
info.innerHTML = '<p style="margin: 0; text-align: center;"></p>';
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

let useAltColor = false;
const colors = [
    '#f7524a',
    '#f77b4a',
    '#ffef08',
    '#00b59c',
    '#009cd6',
    '#c6a5d6',
    '#b55ab5'
];
const trueColorLength = colors.length;
const altColors = [
    '#47A9FA',
    '#F88BC2',
    '#ffffff',
    '#F88BC2',
    '#47A9FA'
];
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const dataPoints = [];
const dataPairs = [];
const points = {};
const dataCache = {};

function formatms(ms) {
    const d = new Date(Date.UTC(0,0,0,0,0,0,ms));
    return [d.getHours() - 1, d.getMinutes(), d.getSeconds()].map(s => s.toString().padStart(2, '0')).join(':');
}

function formatVar(variable) {
    switch(variable) {
        case 'os' : return 'OS';
        case 'cpu' : return 'CPU';

        default : 
            let humanReadable = variable.charAt(0).toUpperCase();
            for(let i = 1; i < variable.length; ++i) {
                const cc = variable.charAt(i);
                if(cc == ':') {
                    humanReadable += variable.substring(i);
                    break;
                }
                const lc = variable.charAt(i - 1)
                if(cc.toUpperCase() == cc && lc.toLowerCase() == lc) {
                    humanReadable += ' ' + cc.toUpperCase();
                } else humanReadable += cc;
            }
            return humanReadable.trim();
    }
}

function convertRange(value, sourceRange, targetRange){
    return (value - sourceRange[0]) * (targetRange[1] - targetRange[0]) / (sourceRange[1] - sourceRange[0]) + targetRange[0];
}

let previousInd = -1;

function render() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    let trueYMax = -Infinity;
    for(let i = 0; i < dataPairs.length; ++i) {
        for(const dataType in dataPairs[i][1]) {
            if(dataPairs[i][1][dataType] > trueYMax) {
                trueYMax = dataPairs[i][1][dataType];
            }
        }
    }
    const pow = Math.pow(10, ((trueYMax | 0).toString().length - 1));

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

        const date = new Date(Math.round(convertRange(i, [0, xSteps], [xMin, xMax]) / 86400000) * 86400000);
        ctx.font = '11px Arial';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#ffffff';
        ctx.strokeText(date.getDate().toString().padStart(2, '0') + ' ' + months[date.getMonth()], x, height + 8);
    };

    ctx.lineWidth = 3;

    for(const key in points) delete points[key];

    if(!dataPoints.length || !dataPairs.length) {
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.font = '32px Verdana';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.fillText(!loading ? 'Graph Empty; No Data (╯•﹏•╰)' : 'Loading :]', width * 0.5, height * 0.5);
        return;
    }

    const multiLabel = dataPoints.length > 1;
    for(let j = 0; j < dataPoints.length; ++j) {
        points[dataPoints[j]] = dataPairs.map(d => [
            convertRange(d[0], [xMin, xMax], [left, width]),
            convertRange(yMax - d[1][dataPoints[j]], [yMin, yMax], [bottom, height])
        ]);

        if(multiLabel) useAltColor = false;

        ctx.lineWidth = 1;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.font = '13px Arial';
        if(j >= colors.length) colors.push('#' + ((Math.random() * 0xffffff) | 0).toString(16).padStart(6, 'f'));
        ctx.strokeStyle = multiLabel ? colors[j] : '#ffffff';
        ctx.strokeText(formatVar(dataPoints[j]), canvas.width, 15 * j + canvas.height * 0.1 + 14 * 0.5);
        ctx.lineWidth = 3;

        const gPoints = points[dataPoints[j]];
        for(let i = 0; i < gPoints.length; ++i) {
            const clr = multiLabel ? colors[j] : (useAltColor ? altColors : colors)[(i / gPoints.length * (useAltColor ? altColors.length : trueColorLength)) | 0];
            if(i == previousInd) {
                ctx.beginPath();
                ctx.arc(gPoints[i][0], gPoints[i][1], 6, 0, Math.PI * 2);
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
            if(i < gPoints.length - 1) {
                ctx.moveTo(gPoints[i][0], gPoints[i][1]);
                ctx.lineTo(gPoints[i+1][0], gPoints[i+1][1]);
            } else if(gPoints.length == 1) {
                ctx.moveTo(left, gPoints[i][1])
                ctx.lineTo(width, gPoints[i][1]);
            } else break;
            ctx.closePath();
            ctx.strokeStyle = clr;
            ctx.stroke();
        }
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
                const dateString = date.getDate().toString().padStart(2, '0') + ' ' + months[date.getMonth()];
                const sortedLabels = Array.from(dataPoints).sort((b,a) => dataPairs[ind][1][a] - dataPairs[ind][1][b]);
                if(!sortedLabels.length) return info.firstElementChild.innerHTML = 'No Data';
                let html = `${dateString}<br>`;
                for(let i = 0; i < sortedLabels.length; ++i) {
                    html += `${formatVar(sortedLabels[i])}: ${dataPairs[ind][1][sortedLabels[i]]}`;
                    if(i != sortedLabels.length - 1) html += '<br>';
                }
                info.firstElementChild.innerHTML = html;
                info.style.top = points[sortedLabels[0]][ind][1] + rect.top - (info.clientHeight * 0.8) + document.documentElement.scrollTop + 'px';
                info.style.left = points[sortedLabels[0]][ind][0] + rect.left - (info.clientWidth * 1.2) + 'px';
                render();
            }
        } else outside();
    } else outside();
});

const queryElements = [
    document.getElementById('from'),
    document.getElementById('to'),
    document.getElementById('path'),
    document.getElementById('domain')
];

class SumMap extends Map {
    inc(key, amt) {
        if(this.has(key)) this.set(key, this.get(key) + amt);
        else this.set(key, amt);
    }

    add(countmap) {
        for(let i = 0; i < countmap.length; ++i) {
            this.inc(countmap[i][0], countmap[i][1]);
        }
    }

    sort() {
        return Array.from(this).sort((a,b) => b[1] - a[1])
    }
}

function resolveLabelValue(day, label) {
    const path = label.split(':');
    if(path.length == 1) return day[label];
    for(let i = 0; i < day[path[0]].length; ++i) {
        if(day[path[0]][i][0] == path[1]) return day[path[0]][i][1];
    }
    return 0;
}

function implementData() {
    dataPairs.length = dataCache.days.length;
    for(let i = 0; i < dataCache.days.length; ++i) {
        const day = dataCache.days[i][1];
        dataPairs[i] = [dataCache.days[i][0], {}];
        for(let j = 0; j < dataPoints.length; ++j) {
            dataPairs[i][1][dataPoints[j]] = resolveLabelValue(day, dataPoints[j]);
        }
    }

    useAltColor = Math.random() < 0.125;
}

function initGraphable(el, name) {
    el.classList.add('graphable');
    el.setAttribute('name', '__' + name);
    if(el.getAttribute('graphed') == 'true') dataPoints.push(name);
    else el.setAttribute('graphed', 'false');
    el.onclick = function() {
        if(el.getAttribute('graphed') == 'true') {
            el.setAttribute('graphed', 'false');
            dataPoints.splice(dataPoints.indexOf(name), 1);
        } else {
            el.setAttribute('graphed', 'true');
            dataPoints.push(name);
        }

        implementData();
        render();
    }
}

const lists = [
    'path', 'browser', 
    'referer', 'outbound',
    'os', 'device',
    'width', 'engine',
    'cpu', 'domain'
];
const sumValues = ['visitors', 'uniqueVisitors', 'dntVisitors'];

const aLists = document.getElementById('aLists');
const summedValues = document.getElementById('sumValues');
for(const id of lists) {
    const div = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.innerText = formatVar(id);
    const el = document.createElement('ul');
    el.innerHTML = '<li>Loading...</li>';
    el.id = 'list_' + id;
    div.appendChild(h3);
    div.appendChild(el);
    aLists.appendChild(div);
}

for(const id of sumValues) {
    const span = document.createElement('span');
    span.id = 'c_' + id;
    span.classList.add('graphable');
    span.innerHTML = 'Loading...';
    span.setAttribute('name', id);
    summedValues.appendChild(span);
}
summedValues.firstElementChild.setAttribute('graphed', 'true');

for(const el of document.getElementsByClassName('graphable')) initGraphable(el, el.getAttribute('name'));
function getData() {
    loading = true;
    dataPairs.length = 0;
    render();
    const xhr = new XMLHttpRequest();

    let url = '/api/anal/';
    for(let i = 0; i < queryElements.length; ++i) {
        if(queryElements[i].value) url += (url == '/api/anal/' ? '?' : '&') + queryElements[i].id + '=' + encodeURIComponent(queryElements[i].value);
    }

    xhr.open('GET', url, true);
    xhr.addEventListener('readystatechange', function() {
        if(this.readyState == 4 && this.status == 200) {
            dataCache.days = JSON.parse(this.responseText).days;

            const sumLists = Object.fromEntries(lists.map(name => [name, new SumMap()]));
            const summed = Object.fromEntries(sumValues.map(name => [name, 0]));

            for(let i = 0; i < dataCache.days.length; ++i) {
                const day = dataCache.days[i][1];

                for(const list in sumLists) {
                    sumLists[list].add(day[list]);
                }

                for(const item in summed) {
                    summed[item] += day[item];
                }
            }

            implementData();

            for(const id of lists) {
                const sorted = sumLists[id].sort();
                const listEl = document.getElementById('list_' + id);
                for(let i = 0; i < listEl.children.length; ++i) {
                    if(listEl.children[i].getAttribute('graphed') == 'true') {
                        dataPoints.splice(dataPoints.indexOf(listEl.children[i].getAttribute('name').substring(2)), 1);
                    }
                }
                listEl.innerHTML = '';
                for(let i = 0; i  < sorted.length; ++i) {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="itemName">${sorted[i][0]}</span><span class="itemperc">${(sorted[i][1] / summed.visitors * 100).toFixed(1)}%</span>`;
                    initGraphable(li, id + ':' + sorted[i][0]);
                    listEl.appendChild(li);
                }
            }

            for(const item in summed) {
                document.getElementById('c_' + item).innerHTML = `${summed[item]} ${formatVar(item)}`;
            }
            loading = false;
            render();
        }
    });
    xhr.send(null);
};
getData();
for(let i = 0; i < queryElements.length; ++i) queryElements[i].onchange = getData;
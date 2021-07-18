class vec2 {
    constructor(x, y) {
        this.x = x || 0;
        this.y = y || 0;
    }
    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        return this;
    }

    mult(n) {
        this.x *= n;
        this.y *= n;
        return this;
    }
}
class vec3 {
    constructor(x, y, z) {
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }
    div(n) {
        this.x /= n;
        this.y /= n;
        this.z /= n;
        return this;
    }
    distance(v) {
        const dx = v.x - this.x,
            dy = v.y - this.y,
            dz = v.z - this.z;

        return dx * dx + dy * dy + dz * dz;
    }
    project(d) {
        return new vec2(this.x, this.z).mult(d / this.y);
    }
}
class Face {
    constructor(verticies) {
        this.verts = verticies;
    }
    avgPos() {
        const pos = new vec3();
        for (let i = 0; i < this.verts.length; ++i) {
            pos.add(this.verts[i]);
        }
        pos.div(this.verts.length)
        return pos.distance(new vec3());
    }
}
class Base {
    constructor(x, y, z) {
        this.center = new vec3(x, y, z);
        this.size = (w * 0.012);
        this.vel = new vec2(Math.random() * 0.15 - 0.075, Math.random() * 0.15 - 0.075);
    }
    update() {
        const speed = 1;
        if (!m1down) this.rotate(this.vel.x * speed, this.vel.y * speed, this.center);
    }
    rotate(theta, phi, center = this.center) {
        const ct = Math.cos(theta),
            st = Math.sin(theta),
            cp = Math.cos(phi),
            sp = Math.sin(phi);

        for (let i = 0; i < this.verticies.length; ++i) {
            const x = this.verticies[i].x - center.x,
                y = this.verticies[i].y - center.y,
                z = this.verticies[i].z - center.z;

            this.verticies[i].x = ct * x - st * cp * y + st * sp * z + center.x;
            this.verticies[i].y = st * x + ct * cp * y - ct * sp * z + center.y;
            this.verticies[i].z = sp * y + cp * z + center.z;
        }
    }
    render(distance) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.fillStyle = '#a0a0a0';

        this.faces = this.faces.sort((a, b) => b.avgPos() - a.avgPos());
        for (let i = 0; i < this.faces.length; ++i) {
            const verts = this.faces[i].verts,
                p0 = verts[0].project(distance);
            ctx.beginPath();
            ctx.moveTo(p0.x + hw, -p0.y + hh);

            for (let j = 1; j < verts.length; ++j) {
                const p = verts[j].project(distance);
                ctx.lineTo(p.x + hw, -p.y + hh);
            }

            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    }
}
class Cube extends Base {
    constructor() {
        super(...arguments);
        const d = this.size * 0.5;
        this.verticies = [
            new vec3(this.center.x - d, this.center.y - d, this.center.z + d),
            new vec3(this.center.x - d, this.center.y - d, this.center.z - d),
            new vec3(this.center.x + d, this.center.y - d, this.center.z - d),
            new vec3(this.center.x + d, this.center.y - d, this.center.z + d),
            new vec3(this.center.x + d, this.center.y + d, this.center.z + d),
            new vec3(this.center.x + d, this.center.y + d, this.center.z - d),
            new vec3(this.center.x - d, this.center.y + d, this.center.z - d),
            new vec3(this.center.x - d, this.center.y + d, this.center.z + d)
        ];

        this.faces = [
            new Face([this.verticies[0], this.verticies[1], this.verticies[2], this.verticies[3]]),
            new Face([this.verticies[3], this.verticies[2], this.verticies[5], this.verticies[4]]),
            new Face([this.verticies[4], this.verticies[5], this.verticies[6], this.verticies[7]]),
            new Face([this.verticies[7], this.verticies[6], this.verticies[1], this.verticies[0]]),
            new Face([this.verticies[7], this.verticies[0], this.verticies[3], this.verticies[4]]),
            new Face([this.verticies[1], this.verticies[6], this.verticies[5], this.verticies[2]])
        ];
    }
}
const canvas = document.createElement('canvas'),
    output = document.getElementById('out'),
    ctx = canvas.getContext('2d'),
    w = 100,
    h = 100,
    hw = w * 0.5,
    hh = h * 0.5,
    ascii = "@%#*+=-:. ";
canvas.width = w;
canvas.height = h;

const cube = new Cube(0, hh, 0);
let m1down = false,
    touchlast = new vec2()
    distance = 2000;

function toAscii() {
    const imageData = ctx.getImageData(0, 0, w, h);
    let str = '';
    let x = 0;
    for(let i = 0; i < imageData.data.length; i++) {
        const avg = 0xff - ((imageData.data[i++] + imageData.data[i++] + imageData.data[i++]) / 3);
        str += ascii.charAt(((avg / 0xff) * (ascii.length - 1)) | 0);
        x += 1;
        if(x == w) {
            x = 0;
            str += '<br>';
        }
    }
    output.innerHTML = str;   
}

function loop() {
    requestAnimationFrame(loop);
    cube.vel.mult(0.996);
    cube.update();
    if(Math.abs(cube.vel.x * cube.vel.x) + Math.abs(cube.vel.y * cube.vel.y) > 0.0000001) {
        ctx.clearRect(0, 0, w, h);
        cube.render(distance);
        toAscii();
    }
}
loop();

window.addEventListener('mousedown', e => {
    m1down = true;
    cube.vel = new vec2();
    output.style.cursor = 'grabbing';
});

window.addEventListener('mousemove', (e) => {
    if (e.buttons) {
        m1down = true;
        cube.rotate(e.movementX * 0.005, e.movementY * 0.005, cube.center);
        cube.vel = new vec2(e.movementX * 0.02, e.movementY * 0.02);
        output.style.cursor = 'grabbing';
    } else {
        m1down = false;
        output.style.cursor = 'grab';
    }
});
window.addEventListener('mouseup', e => {
    m1down = false;
    output.style.cursor = 'grab';
})
window.addEventListener('touchmove', (e) => {
    let curTouch = new vec2(e.touches[0].clientX, e.touches[0].clientY);
    let vel = new vec2(curTouch.x, curTouch.y).sub(touchlast).mult(0.005);
    cube.rotate(vel.x, vel.y, cube.center);
    cube.vel = vel;
    touchlast = curTouch;
    m1down = true;
});
window.addEventListener('touchend', () => {
    m1down = false;
});
window.addEventListener('wheel', e => {
    if(e.deltaY > 0) distance = Math.max(distance - 100, 1);
    else distance = Math.min(distance + 100, 4000);
    ctx.clearRect(0, 0, w, h);
    cube.update();
    cube.render(distance);
    toAscii();
});
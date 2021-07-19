const {fork} = require('child_process');

function run() {
    const child = fork('./app.js');
    child.on('spawn', () => {
        child.stderr.pipe(process.stderr);
        child.stdout.pipe(process.stdout);
    })

    child.on('exit', code => {
        if(code) run();
    });
}
run();
// watcher.js
import { exec } from "child_process";
import chokidar from "chokidar";

const watcher = chokidar.watch("./data", {
  ignored: /(^|[\/\\])\../, // ignore hidden files
  persistent: true
});

watcher.on("add", path => {
  console.log(`New file detected: ${path}`);
  
  // Run your update script automatically
  exec("npm run update", (err, stdout, stderr) => {
    if (err) {
      console.error(`Error: ${err}`);
      return;
    }
    console.log(stdout);
  });
});

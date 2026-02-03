#!/usr/bin/env node
const fs=require("fs"),path=require("path");function w(fp,c){fs.mkdirSync(path.dirname(fp),{recursive:true});fs.writeFileSync(fp,c);console.log("Wrote:",fp);}const B="/Users/twin1/Desktop/projects/ai-dating/src";

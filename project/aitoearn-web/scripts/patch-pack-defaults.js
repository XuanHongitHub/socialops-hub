const fs = require('fs')
const p = 'F:/Herd/AiToEarn/project/aitoearn-web/extensions/flow-automation-ext/assets/index.html-Dpfjgpbd.js'
let s = fs.readFileSync(p, 'utf8')
const old = 'L=zo({migrationVersion:5,defaultMode:"textToVideo",aspectRatio:"16:9",concurrentPrompts:1,outputCount:2,promptDelaySecondsMin:20,promptDelaySecondsMax:30,model:"Veo 3.1 - Lite",defaultVideoOption:"8s",defaultImageOption:"new-image",imageToVideoMaxImagesPerPrompt:1,componentsToVideoMaxImagesPerPrompt:3,imageToImageMaxImagesPerPrompt:3,maxRetries:5,autoDownloadVideoQuality:"720",autoDownloadImageQuality:"1k"'
const neu = 'L=zo({migrationVersion:5,defaultMode:"textToVideo",aspectRatio:"9:16",concurrentPrompts:1,outputCount:1,promptDelaySecondsMin:20,promptDelaySecondsMax:30,model:"Veo 3.1 - Lite",defaultVideoOption:"10s",defaultImageOption:"new-image",imageToVideoMaxImagesPerPrompt:1,componentsToVideoMaxImagesPerPrompt:3,imageToImageMaxImagesPerPrompt:3,maxRetries:5,autoDownloadVideoQuality:"1080",autoDownloadImageQuality:"1k"'
if (!s.includes(old)) {
  // try find current
  const i = s.indexOf('L=zo({migrationVersion:5')
  console.log('CURRENT', s.slice(i, i+280))
  if (s.includes('aspectRatio:"16:9",concurrentPrompts:1,outputCount:2')) {
    s = s.replace('aspectRatio:"16:9",concurrentPrompts:1,outputCount:2', 'aspectRatio:"9:16",concurrentPrompts:1,outputCount:1')
    s = s.replace('defaultVideoOption:"8s"', 'defaultVideoOption:"10s"')
    s = s.replace('autoDownloadVideoQuality:"720"', 'autoDownloadVideoQuality:"1080"')
    fs.writeFileSync(p, s)
    console.log('patched via partial replaces')
  } else if (s.includes(neu.slice(0, 80))) {
    console.log('already new defaults')
  } else {
    console.log('NO MATCH')
  }
} else {
  s = s.replace(old, neu)
  fs.writeFileSync(p, s)
  console.log('patched full default block')
}
const i2 = s.indexOf('L=zo({migrationVersion:5')
console.log('NOW', s.slice(i2, i2+300))

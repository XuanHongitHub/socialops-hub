import { driveFlowGenerationViaCdp } from '../src/app/api/ai/providers/extension/flowCdpDriver.ts'

const r = await driveFlowGenerationViaCdp({
  cdpEndpoint: 'http://127.0.0.1:9480',
  prompt: 'A 10 second vertical fashion commercial for terracotta cartoon cone graphic t-shirt. Soft studio light, photoreal UGC, 9:16.',
  pollMs: 5000,
  pollRounds: 18,
})
console.log(JSON.stringify(r, null, 2))

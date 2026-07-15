# Grok.com Imagine multi-ref video capture (2026-07-13, Playwright MCP Extension)

## Flow
1. UI: Video / 720p / 10s / 9:16
2. Upload images: POST https://grok.com/http/upload-file-v2/direct
   -> fileMetadata.fileMetadataId (UUID)
3. Prompt chips @Image 1 / @Image 2 become @fileMetadataId in API
4. Create: POST https://grok.com/rest/media/post/create
```json
{
  "mediaType": "MEDIA_POST_TYPE_VIDEO",
  "prompt": "@25228736-3e88-40f8-97c1-ec7145005a53  = product print truth. @fe232db8-adaf-460c-b572-4cee31ea834b  = person. She wears EXACT tee print from Image 1. ..."
}
```
5. Post: https://grok.com/imagine/post/ab124a28-eaa4-44cc-80eb-b25c351ad09b

## SocialOps mapping
- Web: @assetId in prompt on consumer API
- API xAI OAuth: reference_images + <IMAGE_n> (public API)
- Do NOT multi-shot stitch board chrome as hero
- Single continuous video only

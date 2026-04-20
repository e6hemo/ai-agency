import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'

export const AD_CREATIVE_TOOL_NAME = 'AdCreative'

const inputSchema = lazySchema(() =>
  z.strictObject({
    product: z.string().describe('Product name, e.g. "Kinza Pomegranate Juice can"'),
    style: z.enum(['ultra_realistic', 'artistic', 'minimalist', 'dark_luxury']).optional().default('ultra_realistic'),
    platform: z.enum(['instagram', 'billboard', 'packaging', 'web_banner']).optional().default('instagram'),
    brandColor: z.string().optional().describe('Primary brand color hex or description, e.g. "#C8102E deep red"'),
    extraDetails: z.string().optional().describe('Any extra visual details or requirements'),
    aspectRatio: z.enum(['1:1', '9:16', '3:4', '16:9', '4:3']).optional().default('1:1'),
  })
)

type InputSchema = ReturnType<typeof inputSchema>
export type Output = { prompt: string; negative: string; notes: string }

const STYLE_PRESETS: Record<string, string> = {
  ultra_realistic: `Ultra-realistic commercial advertising photography, 8K resolution, shot on Hasselblad medium format. Photorealistic product render with physically accurate material simulation. Global illumination, HDR environment lighting, chromatic aberration effects for ultra-realism.`,
  artistic: `Fine art product photography with painterly bokeh. Cinematic color grading. Blended realism and artistry with deep tonal contrast and rich saturation.`,
  minimalist: `Clean minimalist product photography on pure white or off-white background. Soft diffused studio lighting. Negative space composition. Swiss design principles.`,
  dark_luxury: `Dark luxury editorial advertising. Deep black background with dramatic moody side-lit rim lighting. Premium matte and gloss material contrasts. Whisky-brand aesthetic.`
}

const PLATFORM_NOTES: Record<string, string> = {
  instagram: 'Optimized for Instagram feed post. Visually striking within 1-2 second scroll.',
  billboard: 'Large format billboard composition. High contrast readable at distance. Bold hierarchical layout.',
  packaging: 'Packaging mockup visualization with 360-degree material detail.',
  web_banner: 'Web banner hero image. Balanced composition with clear negative space for CTA text overlay.'
}

export const AdCreativeTool = buildTool({
  name: AD_CREATIVE_TOOL_NAME,
  searchHint: 'generate professional advertising creative image prompt for product photography',
  maxResultSizeChars: 100000,
  async description() {
    return 'Generates highly detailed, professional advertising image generation prompts (for Midjourney, DALL·E, Stable Diffusion, or Gemini Imagen) for any product.'
  },
  async prompt() {
    return 'Use this when you need to create a world-class advertising visual for a product. Provide product name, style, and platform to get a ready-to-use Midjourney or DALL·E prompt.'
  },
  get inputSchema() { return inputSchema() },
  get outputSchema() { return lazySchema(() => z.any()) },
  isConcurrencySafe: () => true,
  isReadOnly: () => true,

  async call(input) {
    const style = input.style ?? 'ultra_realistic'
    const platform = input.platform ?? 'instagram'
    const aspectRatio = input.aspectRatio ?? '1:1'
    const stylePreset = STYLE_PRESETS[style] ?? STYLE_PRESETS['ultra_realistic']!
    const platformNote = PLATFORM_NOTES[platform] ?? ''

    const brandSection = input.brandColor
      ? `Brand color palette anchored to ${input.brandColor} with complementary accent tones.`
      : 'Brand-neutral curated color palette with harmonious complementary tones.'

    const extraSection = input.extraDetails ? `\n\nAdditional creative direction: ${input.extraDetails}` : ''

    const prompt = `${stylePreset}

Commercial hero shot of ${input.product}. ${platformNote}

**Product Presentation:**
- Perfect product placement as the visual hero
- Meticulous attention to material physics: reflections, refractions, surface texture
- Condensation, depth, and tactile quality rendered to perfection
- Label/branding clearly legible, facing camera at optimal angle

**Lighting:**
- Three-point professional studio lighting: key, fill, and rim light
- Specular highlights that define the product's premium materiality
- Subtle catchlights and internal reflections
- Soft graduated shadows creating ground and background depth

**Color & Atmosphere:**
- ${brandSection}
- Background: smooth gradient complementing product, reinforcing brand identity
- Color temperature: warm-cool split for cinematic depth

**Composition:**
- Rule of thirds product placement
- Negative space balanced for text/logo overlay potential
- ${aspectRatio} aspect ratio
- Shallow depth-of-field with foreground element hints

**Technical:**
- Zero distortion, optically correct product proportions
- No AI artifacts, no uncanny elements
- Print-ready quality: 300 DPI equivalent${extraSection}`

    const negative = `blurry, out of focus, distorted label, text errors, misspelled brand, amateur lighting, flat lighting, plastic look, cheap packaging, low resolution, watermark, signature, frame, border, cartoon, illustration, 3D render artifacts, overexposed, underexposed, noisy grain, color banding`

    const notes = `📋 Usage notes:
- **Midjourney:** Paste prompt then add \`--ar ${aspectRatio.replace(':', ':')} --q 2 --s 750\`
- **DALL·E 3:** Use as-is (it handles aspect ratio natively)  
- **Stable Diffusion:** Use as positive prompt. Add negative prompt separately.
- **Gemini Imagen:** Paste directly into Imagen 3 prompt field
- Tip: For even better results, specify the exact model/variant of the product (color, size, edition)`

    return { data: { prompt, negative, notes } }
  },

  mapToolResultToToolResultBlockParam(data, toolUseID) {
    const result = `## 🎨 Ad Creative Prompt\n\n### ✅ Positive Prompt:\n${data.prompt}\n\n### ❌ Negative Prompt:\n${data.negative}\n\n${data.notes}`
    return { tool_use_id: toolUseID, type: 'tool_result', content: result }
  },
  userFacingName() { return 'Ad Creative Director' },
  getToolUseSummary(i) { return i ? `Generate ad for: ${i.product}` : 'Ad Creative' },
  renderToolUseMessage() { return `Crafting professional advertising prompt...` },
  renderToolUseTag() { return null },
  renderToolResultMessage() { return null },
  extractSearchText() { return '' },
  renderToolUseErrorMessage(e) { return String(e) },
  async validateInput() { return { result: true } }
} satisfies ToolDef<InputSchema, Output>)

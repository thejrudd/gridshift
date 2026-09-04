import { defineConfig, minimalPreset } from '@vite-pwa/assets-generator/config'

const fullBleedIcon = {
  padding: 0,
  resizeOptions: {
    fit: 'contain',
    background: '#050812',
  },
}

export default defineConfig({
  images: ['public/icons/icon.png'],
  preset: {
    ...minimalPreset,
    transparent: {
      ...minimalPreset.transparent,
      padding: 0,
    },
    maskable: {
      ...minimalPreset.maskable,
      ...fullBleedIcon,
    },
    apple: {
      ...minimalPreset.apple,
      ...fullBleedIcon,
    },
  },
})

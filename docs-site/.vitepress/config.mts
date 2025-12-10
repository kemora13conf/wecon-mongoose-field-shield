import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Mongoose FieldShield",
  description: "Field-Level Access Control for Mongoose",
  base: '/wecon-mongoose-field-shield/',
  
  head: [
    ['link', { rel: 'icon', href: '/wecon-mongoose-field-shield/logo.png' }]
  ],

  themeConfig: {
    logo: '/logo.png',
    
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api/install' },
      { text: 'Examples', link: '/examples/basic' },
      { 
        text: 'v2.1.x',
        items: [
          { text: 'Changelog', link: '/changelog' },
          { text: 'NPM', link: 'https://www.npmjs.com/package/@wecon/mongoose-field-shield' }
        ]
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' }
          ]
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Shield Configuration', link: '/guide/shield-config' },
            { text: 'Role-Based Access', link: '/guide/roles' },
            { text: 'Nested Objects & Arrays', link: '/guide/nested-arrays' },
            { text: 'Conditions', link: '/guide/conditions' },
            { text: 'Transforms', link: '/guide/transforms' }
          ]
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Aggregation Security', link: '/guide/aggregation' },
            { text: 'Strict Mode', link: '/guide/strict-mode' },
            { text: 'Performance', link: '/guide/performance' },
            { text: 'TypeScript', link: '/guide/typescript' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'installFieldShield', link: '/api/install' },
            { text: 'Query Methods', link: '/api/query' },
            { text: 'Aggregate Methods', link: '/api/aggregate' },
            { text: 'Types', link: '/api/types' },
            { text: 'Errors', link: '/api/errors' }
          ]
        }
      ],
      '/examples/': [
        {
          text: 'Examples',
          items: [
            { text: 'Basic Usage', link: '/examples/basic' },
            { text: 'E-Commerce', link: '/examples/ecommerce' },
            { text: 'Social Media', link: '/examples/social' },
            { text: 'Healthcare', link: '/examples/healthcare' },
            { text: 'Multi-Tenant SaaS', link: '/examples/multitenant' }
          ]
        },
        {
          text: 'Edge Cases',
          items: [
            { text: 'Common Pitfalls', link: '/examples/pitfalls' },
            { text: 'Migration Guide', link: '/examples/migration' },
            { text: 'FAQ', link: '/examples/faq' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/kemora13conf/wecon-mongoose-field-shield' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@wecon/mongoose-field-shield' }
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024 Wecon'
    },

    search: {
      provider: 'local'
    }
  }
})

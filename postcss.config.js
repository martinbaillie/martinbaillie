module.exports = {
    plugins: {
        '@fullhuman/postcss-purgecss': {
            content: [
                './layouts/**/*.html',
                './content/**/*.md',
                './static/js/*.js'
            ],
            whitelistPatternsChildren: [/chroma$/],
            whitelist: [
                'highlight',
                'chroma',
                'pre',
                'video',
                'blockquote',
                'code',
                'copy-code-button',
                'content',
                'h3',
                'h4',
                'ul',
                'li'
            ]
        },
        autoprefixer: {},
        cssnano: { preset: 'default' }
    }
};

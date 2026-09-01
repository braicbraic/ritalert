const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 512, height: 512 });

    // Exact emblem + text banner logo from the user's screenshot
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@800&display=swap" rel="stylesheet">
        <style>
            * { box-sizing: border-box; }
            body {
                margin: 0;
                padding: 0;
                background: #090A0F;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 512px;
                width: 512px;
                font-family: 'Outfit', sans-serif;
            }
            .container {
                display: flex;
                align-items: center;
                gap: 16px;
            }
            .logo-text {
                font-size: 56px;
                font-weight: 800;
                background: linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                letter-spacing: -1.5px;
            }
            .avatar-container {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 512px;
                height: 512px;
                background: #06070B;
            }
        </style>
    </head>
    <body>
        <!-- 1. Full Emblem + Text Banner Image -->
        <div class="container" id="banner-logo" style="padding: 40px; background: #06070B;">
            <svg viewBox="0 0 240 240" width="100" height="100">
                <path d="M 115 25 L 60 80 L 115 135 L 170 80" fill="none" stroke="#8B5CF6" stroke-width="16" stroke-linecap="square" />
                <path d="M 100 40 L 45 95 L 100 150 L 155 95" fill="none" stroke="#EC4899" stroke-width="16" stroke-linecap="square" />
                <rect x="180" y="45" width="16" height="16" fill="#EC4899" transform="rotate(45 188 53)" />
                <rect x="198" y="27" width="16" height="16" fill="#EC4899" transform="rotate(45 206 35)" />
            </svg>
            <span class="logo-text">ritalert</span>
        </div>
    </body>
    </html>
    `;

    await page.setContent(htmlContent);
    await page.waitForTimeout(1000);

    // Take screenshot of exact emblem + text banner
    const bannerEl = await page.$('#banner-logo');
    await bannerEl.screenshot({ path: 'c:/Users/5550 DELL PRECISION/VIBECODE PROJECTS/ritalert/assets/ritalert-website-logo.png' });

    // Render 1:1 Avatar Icon for Bot Profile Picture
    const avatarHtml = `
    <!DOCTYPE html>
    <html>
    <body style="margin:0;padding:0;background:#06070B;display:flex;align-items:center;justify-content:center;height:512px;width:512px;">
        <svg viewBox="0 0 240 240" width="340" height="340">
            <path d="M 115 25 L 60 80 L 115 135 L 170 80" fill="none" stroke="#8B5CF6" stroke-width="16" stroke-linecap="square" />
            <path d="M 100 40 L 45 95 L 100 150 L 155 95" fill="none" stroke="#EC4899" stroke-width="16" stroke-linecap="square" />
            <rect x="180" y="45" width="16" height="16" fill="#EC4899" transform="rotate(45 188 53)" />
            <rect x="198" y="27" width="16" height="16" fill="#EC4899" transform="rotate(45 206 35)" />
        </svg>
    </body>
    </html>
    `;
    await page.setContent(avatarHtml);
    await page.screenshot({ path: 'c:/Users/5550 DELL PRECISION/VIBECODE PROJECTS/ritalert/assets/ritalert-bot-profile-picture.png' });

    await browser.close();
    console.log('Successfully generated website logo and bot profile picture!');
})();

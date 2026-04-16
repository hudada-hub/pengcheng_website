const https = require('https');
const fs = require('fs');
const path = require('path');

const fontsDir = path.join(__dirname, 'public', 'fonts');
if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                https.get(redirectUrl, (redirectResponse) => {
                    redirectResponse.pipe(file);
                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                }).on('error', (err) => {
                    fs.unlink(dest, () => {});
                    reject(err);
                });
            } else {
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function main() {
    const baseUrl = 'https://fonts.gstatic.com/s/montserrat/v31/';
    const weights = [300, 400, 600, 700, 800];
    const urls = {
        300: baseUrl + 'JTUSjIg1_i6t8kCHKm459Wlhyw.woff2',
        400: baseUrl + 'JTUSjIg1_i6t8kCHKm459Wlhyw.woff2',
        600: baseUrl + 'JTUSjIg1_i6t8kCHKm459Wlhyw.woff2',
        700: baseUrl + 'JTUSjIg1_i6t8kCHKm459Wlhyw.woff2',
        800: baseUrl + 'JTUSjIg1_i6t8kCHKm459Wlhyw.woff2'
    };

    for (const w of weights) {
        const outFile = path.join(fontsDir, `montserrat-${w}.woff2`);
        console.log(`Downloading montserrat-${w}.woff2...`);
        try {
            await downloadFile(urls[w], outFile);
            console.log(`Downloaded montserrat-${w}.woff2`);
        } catch (err) {
            console.error(`Failed to download montserrat-${w}.woff2:`, err.message);
        }
    }
    console.log('Done!');
}

main();

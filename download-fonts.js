const https = require('https');
const fs = require('fs');
const path = require('path');

const weights = [400, 500, 600, 700, 800];
const baseUrl = 'https://fonts.gstatic.com/s/exo/v25/';
const urls = {
    400: baseUrl + '4UaOrEtFpBISc36j.woff2',
    500: baseUrl + '4UaMrEtFpBISc36j.woff2',
    600: baseUrl + '4UaNrEtFpBISc36j.woff2',
    700: baseUrl + '4UaPrEtFpBISc36j.woff2',
    800: baseUrl + '4UaQrEtFpBISc36j.woff2'
};

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
    for (const w of weights) {
        const outFile = path.join(fontsDir, `exo-${w}.woff2`);
        console.log(`Downloading exo-${w}.woff2...`);
        try {
            await downloadFile(urls[w], outFile);
            console.log(`Downloaded exo-${w}.woff2`);
        } catch (err) {
            console.error(`Failed to download exo-${w}.woff2:`, err.message);
        }
    }
    console.log('Done!');
}

main();

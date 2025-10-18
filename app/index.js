const express = require('express');
const app = express();
const port = process.env.PORT || 6969;


app.get('/', (req, res) => {
	const url = 'https://github.com/KashifWajid/docker-k8s-helm-local-demo';
	const anchor = `<a href="${url}" target="_blank" rel="noopener noreferrer">App 1 : docker-k8s-helm-local-demo</a>`;
	res.type('html').send(anchor);
});


app.get('/health', (req, res) => {
res.status(200).send('ok');
});

app.listen(port, () => {
console.log(`demo-app listening on port ${port}`);
});
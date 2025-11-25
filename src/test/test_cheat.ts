const claim = () => {
    const axios = require('axios');
    let data = JSON.stringify({
        userQuestId: '6741e067d33364b0e4b2d2d9',
    });

    let config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'http://localhost:8000/api/quests/claim-reward',
        headers: {
            'Content-Type': 'application/json',
            Authorization:
                'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0ZWxlZ3JhbUlkIjoiMTAxMjQ4NDI0MiIsImlhdCI6MTczMTA3NzIyNiwiZXhwIjoxODE3NDc3MjI2fQ.vfP5wy4QPIuwPts0Dt7wGpqy0TvdLGUR1FOMOd5ftss',
        },
        data: data,
    };

    axios
        .request(config)
        .then((response: any) => {
            console.log(JSON.stringify(response.data));
        })
        .catch((error: any) => {
            console.log(error.response.data.message);
        });
};

for (let i = 0; i < 10; i++) {
    claim();
}

// ضع هنا رابط السيرفر على Hugging Face Spaces (بدون / في النهاية)
const BACKEND_URL = 'https://YOUR-SPACE-NAME.hf.space';

const API_URL = (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost')
    ? 'http://127.0.0.1:7860/process_video'
    : `${BACKEND_URL}/process_video`;

document.addEventListener('DOMContentLoaded', () => {
    const fileDropArea = document.getElementById('fileDropArea');
    const videoUploadInput = document.getElementById('videoUpload');
    const fileInfo = document.getElementById('fileInfo');
    const fileNameDisplay = document.getElementById('fileName');
    const fileSizeDisplay = document.getElementById('fileSize');
    const removeFileBtn = document.getElementById('removeFileBtn');
    const processVideoBtn = document.getElementById('processVideoBtn');

    const progressSection = document.getElementById('progressSection');
    const progressStage = document.getElementById('progressStage');
    const progressPercent = document.getElementById('progressPercent');
    const elapsedTimeDisplay = document.getElementById('elapsedTime');
    const progressBar = document.getElementById('progressBar');

    const statusMessage = document.getElementById('statusMessage');
    const downloadArea = document.getElementById('downloadArea');
    const resultVideo = document.getElementById('resultVideo');
    const downloadLink = document.getElementById('downloadLink');
    const resetBtn = document.getElementById('resetBtn');

    let selectedFile = null;
    let currentObjectUrl = null;
    let timerInterval = null;
    let simulationInterval = null;

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function setStatus(text, type = 'info') {
        statusMessage.textContent = text;
        statusMessage.className = 'status-message' + (text ? ` ${type}` : '');
    }

    function clearTimers() {
        if (timerInterval) clearInterval(timerInterval);
        if (simulationInterval) clearInterval(simulationInterval);
        timerInterval = null;
        simulationInterval = null;
    }

    function revokeCurrentUrl() {
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }
    }

    function resetUI() {
        clearTimers();
        revokeCurrentUrl();
        selectedFile = null;
        videoUploadInput.value = '';
        fileInfo.style.display = 'none';
        fileDropArea.style.display = 'block';
        processVideoBtn.disabled = true;
        progressSection.style.display = 'none';
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';
        elapsedTimeDisplay.textContent = '00:00';
        downloadArea.style.display = 'none';
        resultVideo.removeAttribute('src');
        setStatus('');
    }

    fileDropArea.addEventListener('click', () => videoUploadInput.click());

    videoUploadInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, () => fileDropArea.classList.add('highlight'));
    });

    ['dragleave', 'drop'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, () => fileDropArea.classList.remove('highlight'));
    });

    fileDropArea.addEventListener('drop', (e) => {
        handleFiles(e.dataTransfer.files);
    });

    function handleFiles(files) {
        if (!files || files.length === 0) return;

        const file = files[0];
        const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|mkv|avi|webm|flv)$/i.test(file.name);

        if (!isVideo) {
            setStatus('الرجاء اختيار ملف فيديو صالح.', 'error');
            return;
        }

        revokeCurrentUrl();
        selectedFile = file;
        fileNameDisplay.textContent = file.name;
        fileSizeDisplay.textContent = formatBytes(file.size);

        fileDropArea.style.display = 'none';
        fileInfo.style.display = 'flex';
        downloadArea.style.display = 'none';
        progressSection.style.display = 'none';
        processVideoBtn.disabled = false;
        setStatus('');
    }

    removeFileBtn.addEventListener('click', resetUI);
    resetBtn.addEventListener('click', resetUI);

    processVideoBtn.addEventListener('click', () => {
        if (!selectedFile) return;

        processVideoBtn.disabled = true;
        removeFileBtn.disabled = true;
        downloadArea.style.display = 'none';
        progressSection.style.display = 'block';
        setStatus('لا تغلق الصفحة أثناء المعالجة، قد يستغرق عزل الموسيقى دقيقة أو أكثر حسب طول الفيديو.', 'info');

        let currentProgress = 0;
        let secondsElapsed = 0;

        progressStage.textContent = 'جاري رفع الفيديو...';
        progressBar.style.width = '0%';
        progressPercent.textContent = '0%';
        elapsedTimeDisplay.textContent = '00:00';

        timerInterval = setInterval(() => {
            secondsElapsed++;
            const mins = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
            const secs = String(secondsElapsed % 60).padStart(2, '0');
            elapsedTimeDisplay.textContent = `${mins}:${secs}`;
        }, 1000);

        const formData = new FormData();
        formData.append('video', selectedFile);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', API_URL, true);
        xhr.responseType = 'blob';
        xhr.timeout = 600000;

        xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const uploadRatio = event.loaded / event.total;
                currentProgress = Math.round(uploadRatio * 25);
                progressBar.style.width = `${currentProgress}%`;
                progressPercent.textContent = `${currentProgress}%`;

                if (uploadRatio >= 1 && !simulationInterval) {
                    progressStage.textContent = 'جاري عزل الموسيقى بالذكاء الاصطناعي...';
                    simulationInterval = setInterval(() => {
                        if (currentProgress < 92) {
                            currentProgress += 1;
                            progressBar.style.width = `${currentProgress}%`;
                            progressPercent.textContent = `${currentProgress}%`;
                        }
                    }, 1500);
                }
            }
        };

        xhr.onload = async () => {
            clearTimers();
            processVideoBtn.disabled = false;
            removeFileBtn.disabled = false;

            if (xhr.status === 200) {
                progressStage.textContent = 'اكتملت المعالجة!';
                progressBar.style.width = '100%';
                progressPercent.textContent = '100%';
                setStatus('');

                revokeCurrentUrl();
                currentObjectUrl = URL.createObjectURL(xhr.response);

                const baseName = selectedFile.name.replace(/\.[^/.]+$/, '');
                resultVideo.src = currentObjectUrl;
                downloadLink.href = currentObjectUrl;
                downloadLink.download = `${baseName}_nomusic.mp4`;
                downloadArea.style.display = 'block';
            } else {
                progressSection.style.display = 'none';
                let errorMsg = `كود الخطأ (${xhr.status})`;
                try {
                    const text = await xhr.response.text();
                    const parsed = JSON.parse(text);
                    if (parsed.error) errorMsg = parsed.error;
                } catch (_) {
                    if (xhr.status === 502 || xhr.status === 504) {
                        errorMsg = `السيرفر استغرق وقتاً طويلاً أو امتلأت الذاكرة (${xhr.status})، جرّب فيديو أقصر.`;
                    } else if (xhr.status === 404) {
                        errorMsg = 'الرابط غير صحيح (404) - تأكد من رابط BACKEND_URL في script.js.';
                    }
                }
                setStatus(`فشلت المعالجة: ${errorMsg}`, 'error');
            }
        };

        xhr.ontimeout = () => {
            clearTimers();
            processVideoBtn.disabled = false;
            removeFileBtn.disabled = false;
            progressSection.style.display = 'none';
            setStatus('انتهت مهلة الاتصال بالسيرفر، جرّب فيديو أقصر.', 'error');
        };

        xhr.onerror = () => {
            clearTimers();
            processVideoBtn.disabled = false;
            removeFileBtn.disabled = false;
            progressSection.style.display = 'none';
            setStatus('تعذر الاتصال بالخادم. تأكد من تشغيل السيرفر وصحة رابط BACKEND_URL.', 'error');
        };

        xhr.send(formData);
    });
});

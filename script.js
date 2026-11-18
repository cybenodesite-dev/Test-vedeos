document.addEventListener('DOMContentLoaded', () => {
    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();

            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });

            // Close mobile menu after clicking a link
            if (mainNavList.classList.contains('active')) {
                mainNavList.classList.remove('active');
            }
        });
    });

    // Mobile Navigation Toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const mainNavList = document.querySelector('.main-nav .nav-list');

    if (menuToggle && mainNavList) {
        menuToggle.addEventListener('click', () => {
            mainNavList.classList.toggle('active');
        });
    }

    // Show/Hide Scroll to Top Button
    const scrollToTopBtn = document.getElementById('scrollToTopBtn');

    if (scrollToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) { // Show button after scrolling 300px
                scrollToTopBtn.style.display = 'flex';
            } else {
                scrollToTopBtn.style.display = 'none';
            }
        });

        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // Active link highlighting based on scroll position (Optional, for more advanced UI)
    const sections = document.querySelectorAll('section');
    const navLinks = document.querySelectorAll('.main-nav .nav-list a');

    function activateNavLink() {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 100; // Adjust offset for fixed header
            if (pageYOffset >= sectionTop) {
                current = section.getAttribute('id');
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').includes(current)) {
                link.classList.add('active');
            }
        });
    }

    window.addEventListener('scroll', activateNavLink);
    activateNavLink(); // Call on load to set initial active link


    // --- Music Remover Logic ---
    const fileDropArea = document.getElementById('fileDropArea');
    const videoUploadInput = document.getElementById('videoUpload');
    const fileNameDisplay = document.getElementById('fileName');
    const processVideoBtn = document.getElementById('processVideoBtn');
    const progressBarContainer = document.getElementById('progressBarContainer');
    const progressBar = document.getElementById('progressBar');
    const statusMessage = document.getElementById('statusMessage');
    const downloadArea = document.getElementById('downloadArea');
    const downloadLink = document.getElementById('downloadLink');

    let selectedFile = null;

    // Handle file selection via click
    fileDropArea.addEventListener('click', () => {
        videoUploadInput.click();
    });

    // Handle file selection via input change
    videoUploadInput.addEventListener('change', (event) => {
        handleFiles(event.target.files);
    });

    // Handle drag and drop
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        fileDropArea.addEventListener(eventName, unhighlight, false);
    });

    fileDropArea.addEventListener('drop', handleDrop, false);

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        fileDropArea.classList.add('highlight');
    }

    function unhighlight() {
        fileDropArea.classList.remove('highlight');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    }

    function handleFiles(files) {
        selectedFile = null;
        fileNameDisplay.textContent = '';
        processVideoBtn.disabled = true;
        statusMessage.textContent = '';
        progressBarContainer.style.display = 'none';
        progressBar.style.width = '0%';
        downloadArea.style.display = 'none';

        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('video/')) {
                selectedFile = file;
                fileNameDisplay.textContent = `الملف المحدد: ${file.name}`;
                processVideoBtn.disabled = false;
                statusMessage.textContent = 'يمكنك الآن بدء المعالجة.';
            } else {
                statusMessage.textContent = 'الرجاء اختيار ملف فيديو صالح.';
            }
        }
    }

    processVideoBtn.addEventListener('click', async () => {
        if (!selectedFile) {
            statusMessage.textContent = 'الرجاء تحديد ملف فيديو أولاً.';
            return;
        }

        processVideoBtn.disabled = true;
        statusMessage.textContent = 'جاري رفع ومعالجة الفيديو، قد يستغرق الأمر بعض الوقت...';
        progressBarContainer.style.display = 'block';
        progressBar.style.width = '0%';
        downloadArea.style.display = 'none';

        const formData = new FormData();
        formData.append('video', selectedFile);

        try {
            // Replace with your actual backend URL
            const response = await fetch('http://127.0.0.1:5000/process_video', {
                method: 'POST',
                body: formData,
                // Add a custom header for progress tracking (optional, backend needs to support it)
                // headers: {
                //     'X-Requested-With': 'XMLHttpRequest'
                // }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                downloadLink.href = url;
                downloadLink.download = `processed_${selectedFile.name}`;
                statusMessage.textContent = 'تمت المعالجة بنجاح!';
                progressBar.style.width = '100%';
                downloadArea.style.display = 'block';
            } else {
                const errorText = await response.text();
                statusMessage.textContent = `حدث خطأ في المعالجة: ${errorText}`;
                progressBar.style.width = '0%';
            }
        } catch (error) {
            console.error('Error:', error);
            statusMessage.textContent = `حدث خطأ أثناء الاتصال بالخادم: ${error.message}`;
            progressBar.style.width = '0%';
        } finally {
            processVideoBtn.disabled = false;
        }
    });
});
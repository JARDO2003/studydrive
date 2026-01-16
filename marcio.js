   import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
        import { getDatabase, ref, set, push, onValue, update, remove, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
        import { getFirestore, collection, addDoc, doc, setDoc, getDoc, getDocs, query, where, orderBy, serverTimestamp as firestoreTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

        const firebaseConfig = {
            apiKey: "AIzaSyDV8s8md1kginP7nohy63XgUR9xNk_p6iE",
            authDomain: "store-ab477.firebaseapp.com",
            databaseURL: "https://store-ab477-default-rtdb.firebaseio.com",
            projectId: "store-ab477",
            storageBucket: "store-ab477.firebasestorage.app",
            messagingSenderId: "109524191191",
            appId: "1:109524191191:web:23f365c1a4712cc094ed92"
        };

        const app = initializeApp(firebaseConfig);
        const db = getDatabase(app);
        const firestore = getFirestore(app);
        const cloudinaryConfig = { cloudName: 'djxcqczh1', uploadPreset: 'database' };

        let currentUser = null;
        let allSubjects = [], allPosts = [], allNotifications = [], conversations = [];
        let currentFiliere = 'all', currentPage = 'studrive', currentChatUser = null, currentChatId = null;
        let mediaRecorder = null, audioChunks = [], recordingStartTime = null;
        let recordingInterval = null, finalTranscript = '', interimTranscript = '';
        let selectedSubjectFile = null, selectedPostMedia = null, selectedOnboardingAvatar = null;
        let isRecording = false, isPaused = false, pausedTime = 0, pauseStartTime = 0;
        let favorites = JSON.parse(localStorage.getItem('studrive_favorites') || '[]');
        let isDarkMode = localStorage.getItem('studrive_darkmode') === 'true';
        let isAudioRecording = false;
        let audioRecorder = null;
        let audioRecordChunks = [];

        // WebRTC variables
        let localStream = null;
        let remoteStream = null;
        let peerConnection = null;
        let currentCallId = null;
        let isVideoCall = false;
        let callStartTime = null;
        let callTimerInterval = null;
        let isMuted = false;
        let isVideoEnabled = true;

        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        if (isDarkMode) {
            document.body.classList.add('dark-mode');
        }
        document.getElementById('themeToggle').textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';

        // Vérifier si l'utilisateur existe déjà
        async function checkUserRegistration() {
            const userId = localStorage.getItem('studrive_uid');
            
            if (!userId) {
                // Nouveau visiteur - afficher l'écran d'inscription
                document.getElementById('onboardingScreen').classList.remove('hidden');
                return;
            }

            // Vérifier dans Firestore
            const userDoc = await getDoc(doc(firestore, 'users', userId));
            
            if (!userDoc.exists()) {
                // L'utilisateur n'existe pas dans Firestore - afficher inscription
                document.getElementById('onboardingScreen').classList.remove('hidden');
                return;
            }

            // L'utilisateur existe - cacher l'écran d'inscription et charger les données
            document.getElementById('onboardingScreen').classList.add('hidden');
            currentUser = { uid: userId, ...userDoc.data() };
            updateUserAvatar();
            loadUserProfile();
            loadSubjects();
            loadPosts();
            loadNotifications();
            loadConversations();
        }

        // Gestion de l'inscription
        document.getElementById('onboardingSelectAvatar').addEventListener('click', () => {
            document.getElementById('onboardingAvatarInput').click();
        });

        document.getElementById('onboardingAvatarInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                selectedOnboardingAvatar = file;
                const reader = new FileReader();
                reader.onload = (e) => {
                    document.getElementById('onboardingAvatarPreview').innerHTML = `<img src="${e.target.result}">`;
                };
                reader.readAsDataURL(file);
            }
        });

        document.getElementById('onboardingSubmit').addEventListener('click', async () => {
            const firstName = document.getElementById('onboardingFirstName').value.trim();
            const lastName = document.getElementById('onboardingLastName').value.trim();
            const filiere = document.getElementById('onboardingFiliere').value;

            if (!firstName || !lastName || !filiere) {
                showToast('Veuillez remplir tous les champs obligatoires', 'error');
                return;
            }

            try {
                showToast('Création de votre compte...', 'success');

                // Générer un ID unique
                const userId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
                
                // Upload avatar si sélectionné
                let profilePicUrl = null;
                if (selectedOnboardingAvatar) {
                    profilePicUrl = await uploadToCloudinary(selectedOnboardingAvatar);
                }

                // Créer l'utilisateur dans Firestore
                const userData = {
                    firstName,
                    lastName,
                    filiere,
                    profilePic: profilePicUrl,
                    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@studrive.com`,
                    createdAt: firestoreTimestamp()
                };

                await setDoc(doc(firestore, 'users', userId), userData);

                // Sauvegarder localement
                localStorage.setItem('studrive_uid', userId);
                
                // Initialiser l'utilisateur actuel
                currentUser = { uid: userId, ...userData };
                
                // Masquer l'écran d'inscription
                document.getElementById('onboardingScreen').classList.add('hidden');
                
                showToast('Compte créé avec succès ! Bienvenue 🎉', 'success');
                
                // Charger les données
                updateUserAvatar();
                loadUserProfile();
                loadSubjects();
                loadPosts();
                loadNotifications();
                loadConversations();
                
            } catch (err) {
                console.error('Erreur lors de la création du compte:', err);
                showToast('Erreur lors de la création du compte', 'error');
            }
        });

        function updateUserAvatar() {
            if (!currentUser) return;
            
            const initial = (currentUser?.firstName || 'U').charAt(0).toUpperCase();
            document.getElementById('avatarInitial').textContent = initial;
            document.getElementById('profileAvatarInitial').textContent = initial;

            if (currentUser?.profilePic) {
                document.getElementById('headerAvatarImg').src = currentUser.profilePic;
                document.getElementById('headerAvatarImg').style.display = 'block';
                document.getElementById('avatarInitial').style.display = 'none';
                document.getElementById('profileAvatarImg').src = currentUser.profilePic;
                document.getElementById('profileAvatarImg').style.display = 'block';
                document.getElementById('profileAvatarInitial').style.display = 'none';
            } else {
                document.getElementById('headerAvatarImg').style.display = 'none';
                document.getElementById('avatarInitial').style.display = 'block';
                document.getElementById('profileAvatarImg').style.display = 'none';
                document.getElementById('profileAvatarInitial').style.display = 'block';
            }
        }

        function loadUserProfile() {
            if (!currentUser) return;
            
            document.getElementById('profileName').textContent = `${currentUser.firstName} ${currentUser.lastName || ''}`.trim();
            document.getElementById('profileEmail').textContent = currentUser.email || 'user@studrive.com';
            document.getElementById('profileFiliere').textContent = currentUser.filiere || 'Filière non définie';
            updateUserAvatar();
            updateProfileStats();
        }

        function updateProfileStats() {
            document.getElementById('statSubjects').textContent = allSubjects.filter(s => s.userId === currentUser?.uid).length;
            document.getElementById('statPosts').textContent = allPosts.filter(p => p.userId === currentUser?.uid).length;
            document.getElementById('statFavorites').textContent = favorites.length;
        }

        document.getElementById('changeAvatarBtn').addEventListener('click', () => {
            document.getElementById('avatarFile').click();
        });

        document.getElementById('avatarFile').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    showToast('Upload de la photo...', 'success');
                    const url = await uploadToCloudinary(file);
                    await setDoc(doc(firestore, 'users', currentUser.uid), { profilePic: url }, { merge: true });
                    currentUser.profilePic = url;
                    updateUserAvatar();
                    showToast('Photo mise à jour !', 'success');
                } catch (err) {
                    showToast('Erreur upload', 'error');
                }
            }
        });

        function formatTime(timestamp) {
            if (!timestamp) return 'maintenant';
            const date = new Date(timestamp);
            const diff = Date.now() - date.getTime();
            const mins = Math.floor(diff / 60000);
            const hours = Math.floor(mins / 60);
            const days = Math.floor(hours / 24);
            if (days > 0) return `il y a ${days}j`;
            if (hours > 0) return `il y a ${hours}h`;
            if (mins > 0) return `il y a ${mins}min`;
            return 'maintenant';
        }

        function showToast(msg, type = 'success') {
            const toast = document.getElementById('toast');
            toast.textContent = msg;
            toast.className = `toast ${type} show`;
            setTimeout(() => toast.classList.remove('show'), 3000);
        }

       // Fonction pour afficher la barre de progression
function showUploadProgress(title = 'Publication en cours...', subtitle = 'Veuillez patienter') {
    document.getElementById('uploadProgressOverlay').classList.add('active');
    document.getElementById('uploadProgressTitle').textContent = title;
    document.getElementById('uploadProgressSubtitle').textContent = subtitle;
    document.getElementById('uploadProgressBar').style.width = '0%';
    document.getElementById('uploadProgressPercent').textContent = '0%';
    document.getElementById('uploadProgressStatus').textContent = 'Préparation...';
}

function updateUploadProgress(percent, status) {
    document.getElementById('uploadProgressBar').style.width = percent + '%';
    document.getElementById('uploadProgressPercent').textContent = Math.round(percent) + '%';
    document.getElementById('uploadProgressStatus').textContent = status;
}

function hideUploadProgress() {
    setTimeout(() => {
        document.getElementById('uploadProgressOverlay').classList.remove('active');
    }, 500);
}

// Fonction uploadToCloudinary modifiée avec progression simulée
async function uploadToCloudinary(file) {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', cloudinaryConfig.uploadPreset);
        
        const resourceType = file.type.startsWith('video/') ? 'video' : 'auto';
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percent = (e.loaded / e.total) * 90; // 90% pour l'upload
                updateUploadProgress(percent, 'Téléchargement du fichier...');
            }
        });
        
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                updateUploadProgress(95, 'Traitement...');
                const data = JSON.parse(xhr.responseText);
                setTimeout(() => {
                    updateUploadProgress(100, 'Terminé !');
                    setTimeout(() => resolve(data.secure_url), 300);
                }, 500);
            } else {
                reject(new Error('Upload failed'));
            }
        });
        
        xhr.addEventListener('error', () => reject(new Error('Network error')));
        
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/upload`);
        xhr.send(formData);
    });
}

// Publier un sujet - NOUVEAU CODE
document.getElementById('submitSubject').addEventListener('click', async () => {
    const title = document.getElementById('subjectTitle').value.trim();
    const filiere = document.getElementById('subjectFiliere').value;
    const description = document.getElementById('subjectDescription').value.trim();

    if (!title || !filiere || !selectedSubjectFile) {
        showToast('Veuillez remplir tous les champs obligatoires', 'error');
        return;
    }

    try {
        showUploadProgress('Publication du sujet', 'Téléchargement en cours...');
        updateUploadProgress(10, 'Préparation du fichier...');

        const fileUrl = await uploadToCloudinary(selectedSubjectFile);

        updateUploadProgress(95, 'Enregistrement...');

        const subjectData = {
            title,
            filiere,
            description,
            fileUrl,
            fileName: selectedSubjectFile.name,
            userId: currentUser.uid,
            userName: `${currentUser.firstName} ${currentUser.lastName}`,
            userProfilePic: currentUser.profilePic || null,
            timestamp: Date.now(),
            views: 0,
            downloads: 0
        };

        const subjectRef = push(ref(db, 'subjects'));
        await set(subjectRef, subjectData);

        updateUploadProgress(100, 'Sujet publié avec succès !');
        
        setTimeout(() => {
            hideUploadProgress();
            showToast('Sujet publié avec succès ! 🎉', 'success');
            closeModal('addSubjectModal');

            // Réinitialiser le formulaire
            document.getElementById('subjectTitle').value = '';
            document.getElementById('subjectFiliere').value = '';
            document.getElementById('subjectDescription').value = '';
            document.getElementById('subjectFileInput').value = '';
            selectedSubjectFile = null;
        }, 800);

    } catch (err) {
        console.error('Erreur:', err);
        hideUploadProgress();
        showToast('Erreur lors de la publication', 'error');
    }
});

// Publier un post - NOUVEAU CODE
document.getElementById('submitPost').addEventListener('click', async () => {
    const caption = document.getElementById('postCaption').value.trim();

    if (!caption && !selectedPostMedia) {
        showToast('Veuillez écrire quelque chose ou ajouter une image/vidéo', 'error');
        return;
    }

    try {
        showUploadProgress('Publication FocusClass', 'Préparation...');
        updateUploadProgress(10, 'Démarrage...');

        let mediaUrl = null;
        let mediaType = null;

        if (selectedPostMedia) {
            updateUploadProgress(20, 'Téléchargement du média...');
            mediaUrl = await uploadToCloudinary(selectedPostMedia);
            mediaType = selectedPostMedia.type;
        } else {
            updateUploadProgress(90, 'Traitement...');
        }

        updateUploadProgress(95, 'Enregistrement...');

        const postData = {
            caption,
            mediaUrl,
            mediaType,
            userId: currentUser.uid,
            userName: `${currentUser.firstName} ${currentUser.lastName}`,
            userProfilePic: currentUser.profilePic || null,
            timestamp: Date.now(),
            likes: {},
            comments: {}
        };

        const postRef = push(ref(db, 'posts'));
        await set(postRef, postData);

        updateUploadProgress(100, 'Publication réussie !');

        setTimeout(() => {
            hideUploadProgress();
            showToast('Publication réussie ! 🎉', 'success');
            closeModal('addPostModal');

            // Réinitialiser le formulaire
            document.getElementById('postCaption').value = '';
            document.getElementById('postMediaInput').value = '';
            selectedPostMedia = null;
        }, 800);

    } catch (err) {
        console.error('Erreur:', err);
        hideUploadProgress();
        showToast('Erreur lors de la publication', 'error');
    }
});

        // Enregistrement audio (désactivé sur mobile Android)
        document.getElementById('startRecording').addEventListener('click', async () => {
    // Utiliser Web Speech API au lieu de MediaRecorder
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('Reconnaissance vocale non supportée sur ce navigateur', 'error');
        return;
    }

    try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'fr-FR';
        
        recognition.onstart = () => {
            isRecording = true;
            recordingStartTime = Date.now();
            pausedTime = 0;
            
            document.getElementById('startRecording').style.display = 'none';
            document.getElementById('pauseRecording').style.display = 'flex';
            document.getElementById('stopRecording').style.display = 'flex';
            document.getElementById('recordingStatus').style.display = 'flex';
            document.getElementById('recordingWaveform').style.display = 'flex';
            document.getElementById('transcriptionResult').style.display = 'block';
            
            recordingInterval = setInterval(() => {
                if (!isPaused) {
                    const elapsed = Math.floor((Date.now() - recordingStartTime - pausedTime) / 1000);
                    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
                    const secs = (elapsed % 60).toString().padStart(2, '0');
                    document.getElementById('recordingTime').textContent = `${mins}:${secs}`;
                }
            }, 1000);
            
            showToast('Enregistrement démarré', 'success');
        };
        
        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interim += transcript;
                }
            }
            document.getElementById('transcriptionText').textContent = finalTranscript + interim;
        };
        
        recognition.onerror = (event) => {
            console.error('Erreur reconnaissance vocale:', event.error);
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                showToast('Erreur: ' + event.error, 'error');
            }
        };
        
        recognition.onend = () => {
            if (isRecording && !isPaused) {
                recognition.start(); // Redémarrer si toujours en enregistrement
            }
        };
        
        mediaRecorder = recognition; // Stocker la référence
        finalTranscript = '';
        recognition.start();
        
    } catch (err) {
        showToast('Erreur : ' + err.message, 'error');
    }
});

document.getElementById('pauseRecording').addEventListener('click', () => {
    if (isPaused) {
        if (mediaRecorder) {
            mediaRecorder.start();
            isPaused = false;
            pausedTime += Date.now() - pauseStartTime;
            document.getElementById('recordingState').textContent = 'En cours...';
            document.getElementById('pauseRecording').innerHTML = '<span>⏸️</span><span>Pause</span>';
        }
    } else {
        if (mediaRecorder) {
            mediaRecorder.stop();
            isPaused = true;
            pauseStartTime = Date.now();
            document.getElementById('recordingState').textContent = 'En pause';
            document.getElementById('pauseRecording').innerHTML = '<span>▶️</span><span>Reprendre</span>';
        }
    }
});

document.getElementById('stopRecording').addEventListener('click', () => {
    if (mediaRecorder) {
        mediaRecorder.stop();
        mediaRecorder.abort();
    }
    clearInterval(recordingInterval);
    isRecording = false;
    isPaused = false;
    document.getElementById('startRecording').style.display = 'flex';
    document.getElementById('pauseRecording').style.display = 'none';
    document.getElementById('stopRecording').style.display = 'none';
    document.getElementById('recordingStatus').style.display = 'none';
    document.getElementById('recordingWaveform').style.display = 'none';
    showToast('Enregistrement terminé', 'success');
});

        document.getElementById('pauseRecording').addEventListener('click', () => {
            if (isPaused) {
                mediaRecorder.resume();
                isPaused = false;
                pausedTime += Date.now() - pauseStartTime;
                document.getElementById('recordingState').textContent = 'En cours...';
                document.getElementById('pauseRecording').innerHTML = '<span>⏸️</span><span>Pause</span>';
            } else {
                mediaRecorder.pause();
                isPaused = true;
                pauseStartTime = Date.now();
                document.getElementById('recordingState').textContent = 'En pause';
                document.getElementById('pauseRecording').innerHTML = '<span>▶️</span><span>Reprendre</span>';
            }
        });

        document.getElementById('stopRecording').addEventListener('click', () => {
            if (mediaRecorder) mediaRecorder.stop();
            clearInterval(recordingInterval);
            isRecording = false;
            isPaused = false;
            document.getElementById('startRecording').style.display = 'flex';
            document.getElementById('pauseRecording').style.display = 'none';
            document.getElementById('stopRecording').style.display = 'none';
            document.getElementById('recordingStatus').style.display = 'none';
            document.getElementById('recordingWaveform').style.display = 'none';
            showToast('Enregistrement terminé', 'success');
        });

        window.copyTranscription = () => {
            navigator.clipboard.writeText(finalTranscript.trim() || 'Aucune transcription').then(() => showToast('Copié !', 'success'));
        };
        window.downloadTranscription = () => {
            const blob = new Blob([finalTranscript.trim()], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `transcription_${Date.now()}.txt`;
            a.click();
            URL.revokeObjectURL(url);
            showToast('Téléchargé !', 'success');
        };
        window.clearTranscription = () => {
            finalTranscript = '';
            interimTranscript = '';
            document.getElementById('transcriptionText').innerHTML = 'Effacé';
            showToast('Transcription effacée', 'success');
        };

        function loadSubjects() {
            const subjectsRef = ref(db, 'subjects');
            onValue(subjectsRef, (snapshot) => {
                allSubjects = [];
                snapshot.forEach((child) => {
                    const data = child.val();
                    data.id = child.key;
                    allSubjects.push(data);
                });
                allSubjects.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                renderSubjects();
                renderFavorites();
                updateProfileStats();
            });
        }

        function renderFavorites() {
            const container = document.getElementById('favoritesList');
            const favSubjects = allSubjects.filter(s => favorites.includes(s.id));
            if (favSubjects.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-icon">❤️</div><div class="empty-title">Aucun sujet en favori</div></div>';
                return;
            }
            container.innerHTML = '';
            favSubjects.forEach(s => {
                const card = document.createElement('div');
                card.className = 'subject-card';
                card.innerHTML = `
                    <div class="subject-image">
                        <div style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 48px; color: white;">📚</div>
                        <button class="favorite-btn active" onclick="event.stopPropagation(); toggleFavorite('${s.id}')">⭐</button>
                    </div>
                    <div class="subject-body">
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
        <div class="subject-title" style="flex: 1;">${s.title || 'Sans titre'}</div>
        ${s.userId === currentUser?.uid ? `
            <button class="icon-btn" onclick="event.stopPropagation(); deleteSubject('${s.id}')" style="width: 32px; height: 32px; font-size: 16px; margin-left: 8px;" title="Supprimer">🗑️</button>
        ` : ''}
    </div>
    <div class="subject-meta">
        <span class="filiere-badge">${s.filiere || 'N/A'}</span>
        <span>•</span> <span>${s.userName || 'Anonyme'}</span>
    </div>
                `;
                container.appendChild(card);
            });
        }

        async function renderSubjects() {
            const container = document.getElementById('subjectsList');
            let filtered = allSubjects;
            if (currentFiliere !== 'all') filtered = filtered.filter(s => s.filiere === currentFiliere);
            const term = document.getElementById('subjectSearch').value.toLowerCase();
            if (term) filtered = filtered.filter(s => (s.title || '').toLowerCase().includes(term));

            if (filtered.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-icon">📚</div><div class="empty-title">Aucun sujet trouvé</div></div>';
                return;
            }

            container.innerHTML = '';
            for (const s of filtered) {
                const isFav = favorites.includes(s.id);
              let imgHTML = '<div style="background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 48px; color: white;">📚</div>';
if (s.fileUrl && s.fileName && /\.(jpg|jpeg|png|gif|webp)$/i.test(s.fileName)) {
    imgHTML = `<img src="${s.fileUrl}" alt="${s.title}" onclick="event.stopPropagation(); openImageViewer('${s.fileUrl}', '${s.userName || 'Anonyme'}')" style="cursor: pointer;">`;
} else if (s.fileName && /\.pdf$/i.test(s.fileName)) {
    imgHTML = '<div style="background: linear-gradient(135deg, #c62828 0%, #ef5350 100%); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 48px; color: white;">📕</div>';
}

                const card = document.createElement('div');
                card.className = 'subject-card';
                card.innerHTML = `
                    <div class="subject-image">
                        ${imgHTML}
                        <button class="favorite-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${s.id}')">${isFav ? '⭐' : '☆'}</button>
                    </div>
                    <div class="subject-body">
                        <div class="subject-title">${s.title || 'Sans titre'}</div>
                        <div class="subject-meta">
                            <span class="filiere-badge">${s.filiere || 'N/A'}</span>
                            <span>•</span> <span>${s.userName || 'Anonyme'}</span>
                        </div>
                        <div class="subject-stats">
                            <div class="subject-stat" onclick="viewSubject('${s.id}')"><span>👁️</span><span>${s.views || 0}</span></div>
                            <div class="subject-stat" onclick="downloadSubject('${s.id}')"><span>⬇️</span><span>${s.downloads || 0}</span></div>
                            <div class="subject-stat" onclick="downloadSubject('${s.id}')"><span>💾</span><span>Télécharger</span></div>
                            <div class="subject-stat" onclick="shareSubject('${s.id}')"><span>↗️</span><span>Partager</span></div>
                        </div>
                        ${s.userId !== currentUser?.uid ? `<button class="message-poster-btn" onclick="event.stopPropagation(); openFullscreenChat('${s.userId}')">Message au poster</button>` : ''}
                    </div>
                `;
                container.appendChild(card);
            }
        }

        window.toggleFavorite = function(subjectId) {
            const index = favorites.indexOf(subjectId);
            if (index > -1) {
                favorites.splice(index, 1);
                showToast('Retiré des favoris', 'success');
            } else {
                favorites.push(subjectId);
                showToast('Ajouté aux favoris !', 'success');
            }
            localStorage.setItem('studrive_favorites', JSON.stringify(favorites));
            renderSubjects();
            renderFavorites();
            updateProfileStats();
        };

        window.viewSubject = async function(subjectId) {
            const subject = allSubjects.find(s => s.id === subjectId);
            if (!subject || !subject.fileUrl) return;
            
            // Incrémenter le compteur de vues
            const subjectRef = ref(db, `subjects/${subjectId}`);
            const currentViews = subject.views || 0;
            await update(subjectRef, { views: currentViews + 1 });
            
            // Ouvrir le fichier
            window.open(subject.fileUrl, '_blank');
        };

        window.downloadSubject = async function(subjectId) {
            const subject = allSubjects.find(s => s.id === subjectId);
            if (!subject || !subject.fileUrl) return;
            
            // Incrémenter le compteur de téléchargements
            const subjectRef = ref(db, `subjects/${subjectId}`);
            const currentDownloads = subject.downloads || 0;
            await update(subjectRef, { downloads: currentDownloads + 1 });
            
            showToast('Téléchargement en cours...', 'success');
            
            // Télécharger le fichier
            const link = document.createElement('a');
            link.href = subject.fileUrl;
            link.download = subject.fileName || 'document';
            link.target = '_blank';
            link.click();
        };

        window.shareSubject = function(subjectId) {
            const subject = allSubjects.find(s => s.id === subjectId);
            if (!subject) return;
            
            const shareText = `Découvrez ce sujet: ${subject.title} - ${subject.filiere}`;
            const shareUrl = subject.fileUrl || window.location.href;
            
            if (navigator.share) {
                navigator.share({
                    title: subject.title,
                    text: shareText,
                    url: shareUrl
                }).then(() => {
                    showToast('Partagé avec succès !', 'success');
                }).catch(err => {
                    console.log('Erreur de partage:', err);
                });
            } else {
                // Fallback: copier le lien
                navigator.clipboard.writeText(shareUrl).then(() => {
                    showToast('Lien copié dans le presse-papier !', 'success');
                });
            }
        };

        async function getUserData(uid) {
            const userDoc = await getDoc(doc(firestore, 'users', uid));
            if (userDoc.exists()) {
                return userDoc.data();
            }
            return { firstName: 'Utilisateur', lastName: '', profilePic: null };
        }

        window.openFullscreenChat = async function(otherUid) {
            if (otherUid === currentUser?.uid) return;
            const members = [currentUser.uid, otherUid].sort();
            currentChatId = members.join('_');
            const chatRef = ref(db, 'chats/' + currentChatId);
            const snap = await new Promise(resolve => onValue(chatRef, resolve, { onlyOnce: true }));
            if (!snap.exists()) {
                await set(chatRef, { members, lastMessage: 'Conversation démarrée', lastTimestamp: serverTimestamp() });
            }
            const otherUser = await getUserData(otherUid);
            currentChatUser = { uid: otherUid, ...otherUser };

            document.getElementById('chatFullscreenUsername').textContent = otherUser.firstName;
            if (otherUser.profilePic) {
                document.getElementById('chatFullscreenAvatarImg').src = otherUser.profilePic;
                document.getElementById('chatFullscreenAvatarImg').style.display = 'block';
                document.getElementById('chatFullscreenAvatarInitial').style.display = 'none';
            } else {
                document.getElementById('chatFullscreenAvatarImg').style.display = 'none';
                document.getElementById('chatFullscreenAvatarInitial').textContent = otherUser.firstName.charAt(0).toUpperCase();
                document.getElementById('chatFullscreenAvatarInitial').style.display = 'flex';
            }

            loadChatMessagesFullscreen();
            document.getElementById('chatFullscreen').classList.add('active');
        };

        function loadChatMessagesFullscreen() {
            const messagesRef = ref(db, 'chats/' + currentChatId + '/messages');
            onValue(messagesRef, (snapshot) => {
                const container = document.getElementById('chatFullscreenMessages');
                container.innerHTML = '';
                const msgs = [];
                snapshot.forEach(child => {
                    const msg = child.val();
                    msg.id = child.key;
                    msgs.push(msg);
                });
                msgs.sort((a, b) => a.timestamp - b.timestamp);
                msgs.forEach(msg => {
                    const div = document.createElement('div');
                    div.className = `chat-bubble ${msg.sender === currentUser.uid ? 'sent' : 'received'}`;
                    if (msg.type === 'image') {
                        div.innerHTML = `<img src="${msg.imageUrl}">`;
                    } else if (msg.type === 'audio') {
                        div.innerHTML = `<audio controls src="${msg.audioUrl}"></audio>`;
                    } else {
                        div.textContent = msg.text || '';
                    }
                    container.appendChild(div);
                });
                container.scrollTop = container.scrollHeight;
            });
        }

        document.getElementById('sendMessageBtnFullscreen').addEventListener('click', async () => {
            const input = document.getElementById('chatTextInputFullscreen');
            const text = input.value.trim();
            if (!text) return;
            const msgRef = push(ref(db, 'chats/' + currentChatId + '/messages'));
            await set(msgRef, { text, sender: currentUser.uid, timestamp: serverTimestamp(), type: 'text' });
            await update(ref(db, 'chats/' + currentChatId), { lastMessage: text, lastTimestamp: serverTimestamp() });
            input.value = '';
        });

        document.getElementById('chatTextInputFullscreen').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('sendMessageBtnFullscreen').click();
            }
        });

        document.getElementById('closeChatFullscreen').addEventListener('click', () => {
            document.getElementById('chatFullscreen').classList.remove('active');
            currentChatUser = null;
            currentChatId = null;
        });

        document.getElementById('attachPhotoBtnFullscreen').addEventListener('click', () => {
            document.getElementById('chatPhotoInputFullscreen').click();
        });

        document.getElementById('chatPhotoInputFullscreen').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    showToast('Envoi de l\'image...', 'success');
                    const url = await uploadToCloudinary(file);
                    const msgRef = push(ref(db, 'chats/' + currentChatId + '/messages'));
                    await set(msgRef, { imageUrl: url, sender: currentUser.uid, timestamp: serverTimestamp(), type: 'image' });
                    await update(ref(db, 'chats/' + currentChatId), { lastMessage: '📷 Photo', lastTimestamp: serverTimestamp() });
                    showToast('Image envoyée !', 'success');
                } catch (err) {
                    showToast('Erreur d\'envoi', 'error');
                }
            }
        });

        function loadPosts() {
            const postsRef = ref(db, 'posts');
            onValue(postsRef, (snapshot) => {
                allPosts = [];
                snapshot.forEach((child) => {
                    const data = child.val();
                    data.id = child.key;
                    allPosts.push(data);
                });
                allPosts.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                renderPosts();
                updateProfileStats();
            });
        }

        function renderPosts() {
            const container = document.getElementById('focusFeed');
            const term = document.getElementById('focusSearch').value.toLowerCase();
            let filtered = allPosts;
            if (term) filtered = filtered.filter(p => (p.caption || '').toLowerCase().includes(term));

            if (filtered.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-icon">🎓</div><div class="empty-title">Aucune publication</div></div>';
                return;
            }

            container.innerHTML = '';
            filtered.forEach(p => {
                const post = document.createElement('div');
                post.className = 'feed-post';
                const avatarHTML = p.userProfilePic ? `<img src="${p.userProfilePic}">` : p.userName?.charAt(0).toUpperCase() || 'U';
                
               let mediaHTML = '';
if (p.mediaUrl) {
    if (p.mediaType && p.mediaType.startsWith('video/')) {
        mediaHTML = `<video class="post-video" controls><source src="${p.mediaUrl}" type="${p.mediaType}">Votre navigateur ne supporte pas les vidéos.</video>`;
    } else {
        mediaHTML = `<img src="${p.mediaUrl}" class="post-media" onclick="openImageViewer('${p.mediaUrl}', '${p.userName || 'Utilisateur'}')" style="cursor: pointer;">`;
    }
}
                post.innerHTML = `
    <div class="post-header">
        <div class="post-avatar">${avatarHTML}</div>
        <div class="post-user-info">
            <div class="post-username">${p.userName || 'Utilisateur'}</div>
            <div class="post-userhandle">${formatTime(p.timestamp)}</div>
        </div>
        ${p.userId === currentUser?.uid ? `
            <button class="icon-btn" onclick="deletePost('${p.id}')" style="margin-left: auto; width: 36px; height: 36px; font-size: 18px;" title="Supprimer">🗑️</button>
        ` : ''}
    </div>
    ${mediaHTML}
    <div class="post-caption">${p.caption || ''}</div>
    <div class="post-actions">
        <button class="post-action-btn ${p.likes && p.likes[currentUser?.uid] ? 'liked' : ''}" onclick="toggleLike('${p.id}')">
            <span class="post-action-icon">❤️</span>
            <span>${Object.keys(p.likes || {}).length}</span>
        </button>
        <button class="post-action-btn">
            <span class="post-action-icon">💬</span>
            <span>${Object.keys(p.comments || {}).length}</span>
        </button>
        <button class="post-action-btn" onclick="sharePost('${p.id}')">
            <span class="post-action-icon">↗️</span>
            <span>Partager</span>
        </button>
    </div>
`;
                container.appendChild(post);
            });
        }

        window.toggleLike = async function(postId) {
            if (!currentUser) return;
            const postRef = ref(db, 'posts/' + postId + '/likes/' + currentUser.uid);
            const post = allPosts.find(p => p.id === postId);
            if (post?.likes && post.likes[currentUser.uid]) {
                await set(postRef, null);
            } else {
                await set(postRef, true);
            }
        };

        window.sharePost = function(postId) {
            const post = allPosts.find(p => p.id === postId);
            if (!post) return;
            
            const shareText = `${post.caption || 'Publication de ' + post.userName}`;
            
            if (navigator.share) {
                navigator.share({
                    title: 'FocusClass',
                    text: shareText,
                    url: window.location.href
                }).then(() => {
                    showToast('Partagé avec succès !', 'success');
                }).catch(err => console.log('Erreur:', err));
            } else {
                navigator.clipboard.writeText(shareText).then(() => {
                    showToast('Texte copié !', 'success');
                });
            }
        };

        function loadNotifications() {
            if (!currentUser) return;
            const notifsRef = ref(db, 'notifications/' + currentUser.uid);
            onValue(notifsRef, (snapshot) => {
                allNotifications = [];
                snapshot.forEach((child) => {
                    const data = child.val();
                    data.id = child.key;
                    allNotifications.push(data);
                });
                allNotifications.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                renderNotifications();
                updateNotificationBadge();
            });
        }

        function renderNotifications() {
            const container = document.getElementById('notificationsList');
            if (allNotifications.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-icon">🔔</div><div class="empty-title">Aucune notification</div></div>';
                return;
            }
            container.innerHTML = '';
            allNotifications.forEach(n => {
                const notif = document.createElement('div');
                notif.className = 'notification-item' + (n.read ? '' : ' unread');
                const icon = n.type === 'like' ? '❤️' : n.type === 'comment' ? '💬' : '🔔';
                notif.innerHTML = `
                    <div style="font-size: 32px;">${icon}</div>
                    <div style="flex: 1;">
                        <div style="font-weight: 700; margin-bottom: 4px;">${n.title || 'Notification'}</div>
                        <div style="font-size: 13px; color: var(--gray-600);">${n.message || ''}</div>
                        <div style="font-size: 12px; color: var(--gray-600); margin-top: 4px;">${formatTime(n.timestamp)}</div>
                    </div>
                `;
                notif.onclick = async () => {
                    if (!n.read) {
                        await update(ref(db, 'notifications/' + currentUser.uid + '/' + n.id), { read: true });
                    }
                };
                container.appendChild(notif);
            });
        }

        function updateNotificationBadge() {
            const unread = allNotifications.filter(n => !n.read).length;
            const badge = document.getElementById('notifBadge');
            if (unread > 0) {
                badge.textContent = unread > 99 ? '99+' : unread;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        function loadConversations() {
            if (!currentUser) return;
            const chatsRef = ref(db, 'chats');
            onValue(chatsRef, async (snapshot) => {
                conversations = [];
                for (const [key, val] of Object.entries(snapshot.val() || {})) {
                    if (val.members && val.members.includes(currentUser.uid)) {
                        const otherUid = val.members.find(m => m !== currentUser.uid);
                        const otherUser = await getUserData(otherUid);
                        conversations.push({
                            id: key,
                            otherUser: { uid: otherUid, ...otherUser },
                            lastMessage: val.lastMessage || '',
                            lastTimestamp: val.lastTimestamp || 0
                        });
                    }
                }
                conversations.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
                renderConversations();
            });
        }

        function renderConversations() {
            const container = document.getElementById('chatList');
            if (conversations.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="empty-icon">🗨️</div><div class="empty-title">Aucune conversation</div></div>';
                return;
            }
            container.innerHTML = '';
            conversations.forEach(conv => {
                const item = document.createElement('div');
                item.className = 'chat-list-item';
                const avatarHTML = conv.otherUser.profilePic ? `<img src="${conv.otherUser.profilePic}">` : conv.otherUser.firstName?.charAt(0).toUpperCase() || 'U';
                item.innerHTML = `
                    <div class="chat-list-avatar">${avatarHTML}</div>
                    <div class="chat-list-info">
                        <div class="chat-list-name">${conv.otherUser.firstName || 'Utilisateur'}</div>
                        <div class="chat-list-preview">${conv.lastMessage}</div>
                    </div>
                    <div class="chat-list-time">${formatTime(conv.lastTimestamp)}</div>
                `;
                item.onclick = () => openFullscreenChat(conv.otherUser.uid);
                container.appendChild(item);
            });
        }



        window.deleteSubject = async function(subjectId) {
    const subject = allSubjects.find(s => s.id === subjectId);
    
    // Vérifier que l'utilisateur est bien le propriétaire
    if (!subject || subject.userId !== currentUser?.uid) {
        showToast('Vous ne pouvez pas supprimer ce sujet', 'error');
        return;
    }
    
    // Demander confirmation
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce sujet ?')) {
        return;
    }
    
    try {
        showToast('Suppression en cours...', 'success');
        
        // Supprimer le sujet de Firebase
        const subjectRef = ref(db, 'subjects/' + subjectId);
        await remove(subjectRef);
        
        // Retirer des favoris si présent
        const favIndex = favorites.indexOf(subjectId);
        if (favIndex > -1) {
            favorites.splice(favIndex, 1);
            localStorage.setItem('studrive_favorites', JSON.stringify(favorites));
        }
        
        showToast('Sujet supprimé avec succès !', 'success');
        
    } catch (err) {
        console.error('Erreur lors de la suppression:', err);
        showToast('Erreur lors de la suppression', 'error');
    }
};



// Protection contre les captures d'écran
let screenshotAttempts = 0;

window.openImageViewer = function(imageUrl, userName) {
    const modal = document.getElementById('imageViewerModal');
    const img = document.getElementById('imageViewerImg');
    const watermark = document.getElementById('imageWatermark');
    
    img.src = imageUrl;
    watermark.textContent = `STUDRIVE - ${userName.toUpperCase()} - ${new Date().toLocaleDateString()}`;
    modal.classList.add('active');
    
    // Désactiver le clic droit
    modal.oncontextmenu = (e) => {
        e.preventDefault();
        showToast('📸 Action bloquée - Image protégée', 'error');
        return false;
    };
    
    // Bloquer les raccourcis clavier de capture
    const blockScreenshot = (e) => {
        // Print Screen, Cmd+Shift+3/4/5 (Mac), Win+Shift+S, etc.
        if (
            e.key === 'PrintScreen' ||
            (e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key)) ||
            (e.key === 's' && e.metaKey && e.shiftKey) ||
            (e.key === 's' && e.ctrlKey && e.shiftKey)
        ) {
            e.preventDefault();
            screenshotAttempts++;
            showToast(`🚫 Capture bloquée (${screenshotAttempts}) - Image protégée`, 'error');
            
            // Flouter temporairement l'image
            const content = document.getElementById('imageViewerContent');
            content.style.filter = 'blur(20px)';
            setTimeout(() => {
                content.style.filter = 'blur(0px)';
            }, 2000);
            
            return false;
        }
    };
    
    document.addEventListener('keyup', blockScreenshot);
    document.addEventListener('keydown', blockScreenshot);
    
    // Détecter si l'utilisateur change d'onglet (possible capture)
    const handleVisibilityChange = () => {
        if (document.hidden) {
            const content = document.getElementById('imageViewerContent');
            content.style.filter = 'blur(30px)';
            showToast('⚠️ Image masquée pour protection', 'error');
        } else {
            setTimeout(() => {
                const content = document.getElementById('imageViewerContent');
                content.style.filter = 'blur(0px)';
            }, 500);
        }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Nettoyer les écouteurs à la fermeture
    modal.dataset.cleanup = 'true';
};

document.getElementById('closeImageViewer').addEventListener('click', closeImageViewer);

document.getElementById('imageViewerModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeImageViewer();
    }
});

function closeImageViewer() {
    const modal = document.getElementById('imageViewerModal');
    modal.classList.remove('active');
    
    // Supprimer tous les écouteurs
    document.removeEventListener('keyup', blockScreenshot);
    document.removeEventListener('keydown', blockScreenshot);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    
    // Réinitialiser
    screenshotAttempts = 0;
}

// Bloquer les outils de développeur lors de la visualisation
document.addEventListener('keydown', function(e) {
    const modal = document.getElementById('imageViewerModal');
    if (modal.classList.contains('active')) {
        // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
        if (
            e.key === 'F12' ||
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
            (e.ctrlKey && e.key === 'U')
        ) {
            e.preventDefault();
            showToast('🔒 Outils de développement bloqués', 'error');
            return false;
        }
    }
});
        // Navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                currentPage = item.dataset.page;
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.getElementById(`${currentPage}Page`).classList.add('active');
                item.classList.add('active');
            });
        });

        document.getElementById('subjectSearch').addEventListener('input', renderSubjects);
        document.getElementById('focusSearch').addEventListener('input', renderPosts);

        document.querySelectorAll('.filiere-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.filiere-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentFiliere = tab.dataset.filiere;
                renderSubjects();
            });
        });

        document.getElementById('themeToggle').addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const dark = document.body.classList.contains('dark-mode');
            localStorage.setItem('studrive_darkmode', dark);
            document.getElementById('themeToggle').textContent = dark ? '☀️' : '🌙';
        });

        document.getElementById('notifBtn').addEventListener('click', () => {
            document.querySelector('[data-page="notifications"]').click();
        });

        document.getElementById('userAvatar').addEventListener('click', () => {
            document.querySelector('[data-page="profile"]').click();
        });

        // FAB Button - Ouvre le bon modal selon la page active
        document.getElementById('fabBtn').addEventListener('click', () => {
            if (currentPage === 'studrive') {
                openModal('addSubjectModal');
            } else if (currentPage === 'focus') {
                openModal('addPostModal');
            }
        });

        function openModal(modalId) {
            document.getElementById(modalId).classList.add('active');
        }

        window.closeModal = function(modalId) {
            document.getElementById(modalId).classList.remove('active');
        };

        // Publier un sujet
        document.getElementById('subjectFileInput').addEventListener('change', (e) => {
            selectedSubjectFile = e.target.files[0];
        });
document.getElementById('submitPost').addEventListener('click', async () => {
    const caption = document.getElementById('postCaption').value.trim();

    if (!caption && !selectedPostMedia) {
        showToast('Veuillez écrire quelque chose ou ajouter une image/vidéo', 'error');
        return;
    }

    try {
        showToast('Publication en cours...', 'success');

        let mediaUrl = null;
        let mediaType = null;

        if (selectedPostMedia) {
            mediaUrl = await uploadToCloudinary(selectedPostMedia);
            mediaType = selectedPostMedia.type;
        }

        const postData = {
            caption,
            mediaUrl,
            mediaType,
            userId: currentUser.uid,
            userName: `${currentUser.firstName} ${currentUser.lastName}`,
            userProfilePic: currentUser.profilePic || null,
            timestamp: Date.now(),
            likes: {},
            comments: {}
        };

        const postRef = push(ref(db, 'posts'));
        await set(postRef, postData);

        showToast('Publication réussie !', 'success');
        closeModal('addPostModal');

        // Réinitialiser le formulaire
        document.getElementById('postCaption').value = '';
        document.getElementById('postMediaInput').value = '';
        selectedPostMedia = null;

    } catch (err) {
        console.error('Erreur:', err);
        showToast('Erreur lors de la publication', 'error');
    }
});

        // Publier un post
        document.getElementById('postMediaInput').addEventListener('change', (e) => {
            selectedPostMedia = e.target.files[0];
        });

        document.getElementById('submitPost').addEventListener('click', async () => {
            const caption = document.getElementById('postCaption').value.trim();

            if (!caption && !selectedPostMedia) {
                showToast('Veuillez écrire quelque chose ou ajouter une image/vidéo', 'error');
                return;
            }

            try {
                showToast('Publication en cours...', 'success');

                let mediaUrl = null;
                let mediaType = null;

                if (selectedPostMedia) {
                    mediaUrl = await uploadToCloudinary(selectedPostMedia);
                    mediaType = selectedPostMedia.type;
                }

                const postData = {
                    caption,
                    mediaUrl,
                    mediaType,
                    userId: currentUser.uid,
                    userName: `${currentUser.firstName} ${currentUser.lastName}`,
                    userProfilePic: currentUser.profilePic || null,
                    timestamp: Date.now(),
                    likes: {},
                    comments: {}
                };

                const postRef = push(ref(db, 'posts'));
                await set(postRef, postData);

                showToast('Publication réussie !', 'success');
                closeModal('addPostModal');

                // Réinitialiser le formulaire
                document.getElementById('postCaption').value = '';
                document.getElementById('postMediaInput').value = '';
                selectedPostMedia = null;

            } catch (err) {
                console.error('Erreur:', err);
                showToast('Erreur lors de la publication', 'error');
            }
        });

        // ===== WEBRTC CALLING FUNCTIONS =====
        
        async function startCall(isVideo) {
            if (!currentChatUser) return;
            
            isVideoCall = isVideo;
            currentCallId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
            
            try {
                const constraints = {
                    audio: true,
                    video: isVideo ? { 
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    } : false
                };
                
                localStream = await navigator.mediaDevices.getUserMedia(constraints);
                
                const localVideoEl = document.getElementById('localVideo');
                localVideoEl.srcObject = localStream;
                localVideoEl.style.display = 'block';
                
                document.getElementById('callUserName').textContent = currentChatUser.firstName || 'Utilisateur';
                document.getElementById('callStatus').textContent = 'Appel en cours...';
                document.getElementById('callTimer').textContent = '00:00';
                
                if (isVideo) {
                    document.getElementById('callVideos').style.display = 'block';
                    document.getElementById('audioOnlyIndicator').style.display = 'none';
                    document.getElementById('toggleVideoBtn').style.display = 'flex';
                } else {
                    document.getElementById('callVideos').style.display = 'none';
                    document.getElementById('audioOnlyIndicator').style.display = 'flex';
                    document.getElementById('toggleVideoBtn').style.display = 'none';
                    const initial = currentChatUser.firstName?.charAt(0).toUpperCase() || '👤';
                    document.getElementById('audioAvatar').textContent = initial;
                }
                
                document.getElementById('callModal').classList.add('active');
                
                peerConnection = new RTCPeerConnection(configuration);
                
                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                });
                
                peerConnection.ontrack = (event) => {
                    remoteStream = event.streams[0];
                    const remoteVideoEl = document.getElementById('remoteVideo');
                    remoteVideoEl.srcObject = remoteStream;
                    remoteVideoEl.style.display = 'block';
                    
                    if (isVideo) {
                        document.getElementById('callVideos').style.display = 'block';
                        document.getElementById('audioOnlyIndicator').style.display = 'none';
                    }
                };
                
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        const candidateRef = push(ref(db, `calls/${currentCallId}/candidates/${currentUser.uid}`));
                        set(candidateRef, {
                            candidate: event.candidate.toJSON(),
                            timestamp: serverTimestamp()
                        });
                    }
                };
                
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                
                const callData = {
                    callerId: currentUser.uid,
                    callerName: currentUser?.firstName || 'Utilisateur',
                    callerAvatar: currentUser?.profilePic || null,
                    receiverId: currentChatUser.uid,
                    offer: {
                        type: offer.type,
                        sdp: offer.sdp
                    },
                    isVideo: isVideo,
                    status: 'ringing',
                    timestamp: serverTimestamp()
                };
                
                await set(ref(db, `calls/${currentCallId}`), callData);
                
                listenForAnswer();
                
                showToast(isVideo ? 'Appel vidéo en cours...' : 'Appel audio en cours...', 'success');
                
            } catch (err) {
                console.error('Error starting call:', err);
                showToast('Erreur lors du démarrage de l\'appel: ' + err.message, 'error');
                endCall();
            }
        }
        
        function listenForAnswer() {
            const callRef = ref(db, `calls/${currentCallId}`);
            const unsubscribe = onValue(callRef, async (snapshot) => {
                const data = snapshot.val();
                if (!data) return;
                
                if (data.status === 'answered' && data.answer && peerConnection) {
                    try {
                        if (peerConnection.signalingState === 'have-local-offer') {
                            const answer = new RTCSessionDescription(data.answer);
                            await peerConnection.setRemoteDescription(answer);
                            document.getElementById('callStatus').textContent = 'Connecté';
                            startCallTimer();
                            listenForCandidates(data.receiverId);
                            unsubscribe();
                        }
                    } catch (err) {
                        console.error('Error setting remote description:', err);
                    }
                } else if (data.status === 'rejected') {
                    unsubscribe();
                    endCall();
                    showToast('Appel refusé', 'error');
                } else if (data.status === 'ended') {
                    unsubscribe();
                    endCall();
                }
            });
        }
        
        function listenForIncomingCalls() {
            if (!currentUser) return;
            const callsRef = ref(db, 'calls');
            onValue(callsRef, (snapshot) => {
                snapshot.forEach((child) => {
                    const call = child.val();
                    if (call.receiverId === currentUser.uid && call.status === 'ringing') {
                        currentCallId = child.key;
                        showIncomingCallModal(call);
                    }
                });
            });
        }
        
        function showIncomingCallModal(call) {
            const modal = document.getElementById('incomingCallModal');
            document.getElementById('incomingCallerName').textContent = call.callerName || 'Utilisateur';
            document.getElementById('incomingCallType').textContent = call.isVideo ? 'Appel vidéo entrant...' : 'Appel audio entrant...';
            
            const avatar = document.getElementById('incomingCallAvatar');
            if (call.callerAvatar) {
                avatar.innerHTML = `<img src="${call.callerAvatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                avatar.textContent = call.callerName?.charAt(0).toUpperCase() || '👤';
            }
            
            modal.classList.add('active');
            isVideoCall = call.isVideo;
            
            document.getElementById('acceptCallBtn').onclick = async () => {
                modal.classList.remove('active');
                await answerCall(call);
            };
            
            document.getElementById('rejectCallBtn').onclick = () => {
                modal.classList.remove('active');
                rejectCall();
            };
        }
        
        async function answerCall(call) {
            try {
                const constraints = {
                    audio: true,
                    video: call.isVideo ? {
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    } : false
                };
                
                localStream = await navigator.mediaDevices.getUserMedia(constraints);
                
                const localVideoEl = document.getElementById('localVideo');
                localVideoEl.srcObject = localStream;
                localVideoEl.style.display = 'block';
                
                document.getElementById('callUserName').textContent = call.callerName || 'Utilisateur';
                document.getElementById('callStatus').textContent = 'Connecté';
                document.getElementById('callTimer').textContent = '00:00';
                
                if (call.isVideo) {
                    document.getElementById('callVideos').style.display = 'block';
                    document.getElementById('audioOnlyIndicator').style.display = 'none';
                    document.getElementById('toggleVideoBtn').style.display = 'flex';
                } else {
                    document.getElementById('callVideos').style.display = 'none';
                    document.getElementById('audioOnlyIndicator').style.display = 'flex';
                    document.getElementById('toggleVideoBtn').style.display = 'none';
                    document.getElementById('audioAvatar').textContent = call.callerName?.charAt(0).toUpperCase() || '👤';
                }
                
                document.getElementById('callModal').classList.add('active');
                
                peerConnection = new RTCPeerConnection(configuration);
                
                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                });
                
                peerConnection.ontrack = (event) => {
                    remoteStream = event.streams[0];
                    const remoteVideoEl = document.getElementById('remoteVideo');
                    remoteVideoEl.srcObject = remoteStream;
                    remoteVideoEl.style.display = 'block';
                    
                    if (call.isVideo) {
                        document.getElementById('callVideos').style.display = 'block';
                        document.getElementById('audioOnlyIndicator').style.display = 'none';
                    }
                };
                
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        const candidateRef = push(ref(db, `calls/${currentCallId}/candidates/${currentUser.uid}`));
                        set(candidateRef, {
                            candidate: event.candidate.toJSON(),
                            timestamp: serverTimestamp()
                        });
                    }
                };
                
                const offer = new RTCSessionDescription(call.offer);
                await peerConnection.setRemoteDescription(offer);
                
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                
                await update(ref(db, `calls/${currentCallId}`), {
                    answer: {
                        type: answer.type,
                        sdp: answer.sdp
                    },
                    status: 'answered'
                });
                
                startCallTimer();
                listenForCandidates(call.callerId);
                listenForCallEnd();
                
                showToast('Appel accepté', 'success');
                
            } catch (err) {
                console.error('Error answering call:', err);
                showToast('Erreur lors de la réponse: ' + err.message, 'error');
                rejectCall();
            }
        }
        
        function rejectCall() {
            update(ref(db, `calls/${currentCallId}`), {
                status: 'rejected'
            });
            currentCallId = null;
        }
        
        function listenForCandidates(otherUserId) {
            const candidatesRef = ref(db, `calls/${currentCallId}/candidates/${otherUserId}`);
            const unsubscribe = onValue(candidatesRef, (snapshot) => {
                snapshot.forEach((child) => {
                    const data = child.val();
                    if (data.candidate && peerConnection && peerConnection.remoteDescription) {
                        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate))
                            .catch(err => console.error('Error adding ICE candidate:', err));
                    }
                });
            });
            
            if (!window.callUnsubscribers) window.callUnsubscribers = [];
            window.callUnsubscribers.push(unsubscribe);
        }
        
        function listenForCallEnd() {
            const callRef = ref(db, `calls/${currentCallId}`);
            const unsubscribe = onValue(callRef, (snapshot) => {
                const data = snapshot.val();
                if (data && data.status === 'ended') {
                    endCall();
                }
            });
            
            if (!window.callUnsubscribers) window.callUnsubscribers = [];
            window.callUnsubscribers.push(unsubscribe);
        }
        
        function startCallTimer() {
            callStartTime = Date.now();
            callTimerInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
                const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const secs = (elapsed % 60).toString().padStart(2, '0');
                document.getElementById('callTimer').textContent = `${mins}:${secs}`;
            }, 1000);
        }
        
        function endCall() {
            if (window.callUnsubscribers) {
                window.callUnsubscribers.forEach(unsub => {
                    try {
                        unsub();
                    } catch (e) {
                        console.error('Error unsubscribing:', e);
                    }
                });
                window.callUnsubscribers = [];
            }
            
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    track.stop();
                });
                localStream = null;
            }
            
            if (remoteStream) {
                remoteStream.getTracks().forEach(track => {
                    track.stop();
                });
                remoteStream = null;
            }
            
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            
            if (callTimerInterval) {
                clearInterval(callTimerInterval);
                callTimerInterval = null;
            }
            
            const localVideoEl = document.getElementById('localVideo');
            const remoteVideoEl = document.getElementById('remoteVideo');
            if (localVideoEl) {
                localVideoEl.srcObject = null;
                localVideoEl.style.display = 'none';
            }
            if (remoteVideoEl) {
                remoteVideoEl.srcObject = null;
                remoteVideoEl.style.display = 'none';
            }
            
            if (currentCallId) {
                update(ref(db, `calls/${currentCallId}`), {
                    status: 'ended',
                    endTime: serverTimestamp()
                }).catch(err => console.error('Error updating call status:', err));
            }
            
            document.getElementById('callModal').classList.remove('active');
            document.getElementById('incomingCallModal').classList.remove('active');
            
            currentCallId = null;
            isMuted = false;
            isVideoEnabled = true;
            callStartTime = null;
            
            document.getElementById('muteMicBtn').classList.remove('muted');
            document.getElementById('muteMicBtn').textContent = '🎤';
            const toggleVideoBtn = document.getElementById('toggleVideoBtn');
            if (toggleVideoBtn) {
                toggleVideoBtn.classList.remove('disabled');
                toggleVideoBtn.textContent = '📹';
            }
        }
        
        function toggleMute() {
            if (localStream) {
                const audioTrack = localStream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.enabled = !audioTrack.enabled;
                    isMuted = !audioTrack.enabled;
                    const btn = document.getElementById('muteMicBtn');
                    btn.classList.toggle('muted', isMuted);
                    btn.textContent = isMuted ? '🔇' : '🎤';
                    showToast(isMuted ? 'Micro coupé' : 'Micro activé', 'success');
                }
            }
        }
        
        function toggleVideo() {
            if (localStream && isVideoCall) {
                const videoTrack = localStream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.enabled = !videoTrack.enabled;
                    isVideoEnabled = videoTrack.enabled;
                    const btn = document.getElementById('toggleVideoBtn');
                    btn.classList.toggle('disabled', !isVideoEnabled);
                    btn.textContent = isVideoEnabled ? '📹' : '📵';
                    showToast(isVideoEnabled ? 'Caméra activée' : 'Caméra désactivée', 'success');
                }
            }
        }

        async function startAudioRecording() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioRecorder = new MediaRecorder(stream);
                audioRecordChunks = [];
                
                audioRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) audioRecordChunks.push(e.data);
                };
                
                audioRecorder.onstop = async () => {
                    const audioBlob = new Blob(audioRecordChunks, { type: 'audio/webm' });
                    const audioFile = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
                    
                    try {
                        showToast('Envoi de l\'audio...', 'success');
                        const url = await uploadToCloudinary(audioFile);
                        const msgRef = push(ref(db, 'chats/' + currentChatId + '/messages'));
                        await set(msgRef, {
                            audioUrl: url,
                            sender: currentUser.uid,
                            timestamp: serverTimestamp(),
                            type: 'audio'
                        });
                        await update(ref(db, 'chats/' + currentChatId), {
                            lastMessage: '🎤 Audio',
                            lastTimestamp: serverTimestamp()
                        });
                        showToast('Audio envoyé !', 'success');
                    } catch (err) {
                        showToast('Erreur d\'envoi', 'error');
                    }
                    
                    stream.getTracks().forEach(track => track.stop());
                    isAudioRecording = false;
                    document.getElementById('recordAudioBtnFullscreen').textContent = '🎤';
                };
                
                audioRecorder.start();
                isAudioRecording = true;
                document.getElementById('recordAudioBtnFullscreen').textContent = '⏹️';
                showToast('Enregistrement audio...', 'success');
                
            } catch (err) {
                showToast('Erreur micro : ' + err.message, 'error');
            }
        }
        
        function stopAudioRecording() {
            if (audioRecorder && isAudioRecording) {
                audioRecorder.stop();
            }
        }

        document.getElementById('audioCallBtn').addEventListener('click', () => startCall(false));
        document.getElementById('videoCallBtn').addEventListener('click', () => startCall(true));
        document.getElementById('endCallBtn').addEventListener('click', endCall);
        document.getElementById('muteMicBtn').addEventListener('click', toggleMute);
        document.getElementById('toggleVideoBtn').addEventListener('click', toggleVideo);
        
        document.getElementById('recordAudioBtnFullscreen').addEventListener('click', () => {
            if (isAudioRecording) {
                stopAudioRecording();
            } else {
                startAudioRecording();
            }
        });


        window.deletePost = async function(postId) {
    const post = allPosts.find(p => p.id === postId);
    
    // Vérifier que l'utilisateur est bien le propriétaire
    if (!post || post.userId !== currentUser?.uid) {
        showToast('Vous ne pouvez pas supprimer ce post', 'error');
        return;
    }
    
    // Demander confirmation
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette publication ?')) {
        return;
    }
    
    try {
        showToast('Suppression en cours...', 'success');
        
        // Supprimer le post de Firebase
        const postRef = ref(db, 'posts/' + postId);
        await remove(postRef);
        
        showToast('Publication supprimée avec succès !', 'success');
        
    } catch (err) {
        console.error('Erreur lors de la suppression:', err);
        showToast('Erreur lors de la suppression', 'error');
    }
};



        // Initialiser l'application
        checkUserRegistration();
        listenForIncomingCalls();

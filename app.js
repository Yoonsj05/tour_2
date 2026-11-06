import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { getDatabase, ref, onValue, set, remove } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-functions.js";

// [수정 필요] Firebase 콘솔 > 프로젝트 설정 > 일반 > 내 앱 > SDK 설정 및 구성
const firebaseConfig = {
  apiKey: "여기에_FIREBASE_API_KEY",
  authDomain: "여기에_프로젝트ID.firebaseapp.com",
  databaseURL: "여기에_REALTIME_DATABASE_URL",
  projectId: "여기에_프로젝트ID",
  appId: "여기에_FIREBASE_APP_ID"
};

// functions/index.js의 region과 반드시 같아야 해요.
const FUNCTIONS_REGION = "asia-northeast3";

const page = document.body.dataset.page;
const grid = document.getElementById("cardGrid");
const statusEl = document.getElementById("status");
const countEl = document.getElementById("resultCount");
const favoritesCountEl = document.getElementById("favoriteCount");
const searchButton = document.getElementById("searchButton");
const moreButton = document.getElementById("moreButton");
const regionSelect = document.getElementById("regionSelect");

let userId = null;
let favorites = {};
let attractions = [];
let currentPage = 0;
let currentTotal = 0;
let loading = false;
let unsubscribeFavorites = null;
let database;
let getAttractions;

function showStatus(message, error = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", error);
}

function showEmpty(message) {
  grid.replaceChildren();
  const element = document.createElement("div");
  element.className = "empty";
  element.textContent = message;
  grid.append(element);
}

function safeImageUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    url.protocol = "https:";
    return url.href;
  } catch {
    return "";
  }
}

function makeCard(place) {
  const card = document.createElement("article");
  card.className = "place-card";
  const imageUrl = safeImageUrl(place.image);

  if (imageUrl) {
    const image = document.createElement("img");
    image.className = "place-img";
    image.src = imageUrl;
    image.alt = `${place.title} 대표 이미지`;
    image.loading = "lazy";
    image.onerror = () => {
      const fallback = document.createElement("div");
      fallback.className = "image-fallback";
      fallback.textContent = "이미지를 불러올 수 없어요";
      image.replaceWith(fallback);
    };
    card.append(image);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "image-fallback";
    fallback.textContent = "등록된 사진이 없어요";
    card.append(fallback);
  }

  const body = document.createElement("div");
  body.className = "place-body";
  const title = document.createElement("h3");
  title.textContent = place.title || "이름 없는 관광지";
  const address = document.createElement("p");
  address.className = "place-address";
  address.textContent = place.address || "주소 정보가 없어요";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "favorite-btn";
  button.dataset.favoriteId = place.id;
  const saved = Boolean(favorites[place.id]);
  button.classList.toggle("saved", saved);
  button.textContent = saved ? "♥ 찜 취소하기" : "♡ 찜하기";
  button.setAttribute("aria-pressed", String(saved));
  button.disabled = !userId;

  body.append(title, address, button);
  card.append(body);
  return card;
}

function render() {
  favoritesCountEl.textContent = String(Object.keys(favorites).length);

  if (page === "favorites") {
    const savedPlaces = Object.values(favorites).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    countEl.textContent = `총 ${savedPlaces.length}곳`;
    if (savedPlaces.length === 0) {
      showEmpty("아직 찜한 관광지가 없어요. 관광지 찾기에서 하트를 눌러보세요.");
      return;
    }
    grid.replaceChildren(...savedPlaces.map(makeCard));
    return;
  }

  countEl.textContent = attractions.length ? `현재 ${attractions.length}곳 / 전체 ${currentTotal}곳` : "";
  if (!attractions.length) {
    showEmpty("지역을 선택해 관광지를 검색해보세요.");
    return;
  }
  grid.replaceChildren(...attractions.map(makeCard));
}

async function toggleFavorite(place, button) {
  if (!userId) {
    showStatus("Firebase 연결이 완료되지 않았어요.", true);
    return;
  }
  button.disabled = true;
  const favoriteRef = ref(database, `users/${userId}/favorites/${place.id}`);
  try {
    if (favorites[place.id]) {
      await remove(favoriteRef);
      showStatus(`'${place.title}' 찜을 취소했어요.`);
    } else {
      await set(favoriteRef, {
        id: place.id,
        title: place.title,
        address: place.address,
        image: place.image || "",
        savedAt: Date.now()
      });
      showStatus(`'${place.title}' 관광지를 찜했어요.`);
    }
  } catch (error) {
    console.error("찜 저장 오류:", error);
    showStatus(`찜을 변경하지 못했어요: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
}

async function loadRegions() {
  regionSelect.disabled = true;
  searchButton.disabled = true;
  showStatus("지역 목록을 불러오는 중이에요...");
  try {
    const response = await getAttractions({ mode: "regions" });
    const regions = response.data.regions || [];
    if (!regions.length) throw new Error("지역 코드가 비어 있어요.");
    regionSelect.replaceChildren(...regions.map((region) => {
      const option = document.createElement("option");
      option.value = region.code;
      option.textContent = region.name;
      return option;
    }));
    if (regions.some((region) => region.code === "11")) regionSelect.value = "11";
    regionSelect.disabled = false;
    searchButton.disabled = false;
    await searchPlaces(true);
  } catch (error) {
    console.error("지역 목록 오류:", error);
    showStatus(`지역 목록을 가져오지 못했어요: ${error.message}`, true);
  }
}

async function searchPlaces(reset = true) {
  if (!userId || loading) return;
  loading = true;
  searchButton.disabled = true;
  moreButton.disabled = true;
  regionSelect.disabled = true;
  const regionCode = regionSelect.value;
  const nextPage = reset ? 1 : currentPage + 1;
  showStatus("관광정보를 불러오는 중이에요...");

  try {
    const response = await getAttractions({ regionCode, pageNo: nextPage });
    const data = response.data;
    if (reset) attractions = [];
    attractions.push(...data.items);
    currentPage = nextPage;
    currentTotal = Number(data.totalCount) || 0;
    render();
    moreButton.hidden = attractions.length >= currentTotal || data.items.length === 0;
    showStatus(data.items.length ? `${regionSelect.selectedOptions[0].textContent} 관광지를 불러왔어요.` : "조회된 관광지가 없어요.");
  } catch (error) {
    console.error("관광정보 조회 오류:", error);
    showStatus(`조회에 실패했어요: ${error.message}`, true);
    if (reset) {
      attractions = [];
      currentPage = 0;
      currentTotal = 0;
      render();
    }
    moreButton.hidden = true;
  } finally {
    loading = false;
    searchButton.disabled = false;
    moreButton.disabled = false;
    regionSelect.disabled = false;
  }
}

// Firebase 설정이 비어 있으면 오류를 알리고 실행을 멈춥니다.
if (Object.values(firebaseConfig).some(value => !value || value.startsWith("여기에_"))) {
  showStatus("app.js 맨 위 firebaseConfig를 실제 Firebase 설정값으로 바꿔주세요.", true);
  showEmpty("Firebase 설정을 먼저 완료해주세요.");
  if (moreButton) moreButton.hidden = true;
} else {
  startFirebase();
}

function startFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    database = getDatabase(app);
    const functions = getFunctions(app, FUNCTIONS_REGION);
    getAttractions = httpsCallable(functions, "getAttractions");

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          showStatus(`익명 로그인 실패: ${error.message}`, true);
        }
        return;
      }
      userId = user.uid;
      if (unsubscribeFavorites) unsubscribeFavorites();
      unsubscribeFavorites = onValue(ref(database, `users/${userId}/favorites`), (snapshot) => {
        favorites = snapshot.val() || {};
        render();
        if (page === "favorites") showStatus("찜 보관함을 불러왔어요.");
      }, (error) => {
        console.error("보관함 읽기 오류:", error);
        showStatus(`보관함을 읽을 수 없어요: ${error.message}`, true);
      });
      if (page === "search") {
        await loadRegions();
      }
    }, (error) => showStatus(`인증 상태 오류: ${error.message}`, true));

    grid.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-favorite-id]");
      if (!button) return;
      const source = page === "favorites" ? Object.values(favorites) : attractions;
      const place = source.find((entry) => entry.id === button.dataset.favoriteId);
      if (place) toggleFavorite(place, button);
    });

    if (page === "search") {
      regionSelect.addEventListener("change", () => searchPlaces(true));
      searchButton.addEventListener("click", () => searchPlaces(true));
      moreButton.addEventListener("click", () => searchPlaces(false));
      showEmpty("Firebase에 연결하고 있어요...");
    }
  } catch (error) {
    console.error("Firebase 초기화 오류:", error);
    showStatus(`Firebase 연결 실패: ${error.message}`, true);
  }
}

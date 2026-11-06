const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const tourApiKey = defineSecret("TOUR_API_KEY");
exports.getAttractions = onCall(
  {
    region: "asia-northeast3",
    secrets: [tourApiKey],
    timeoutSeconds: 20,
    maxInstances: 2,
    memory: "256MiB"
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "로그인 후 관광정보를 조회할 수 있어요.");
    }

    const isRegionList = request.data?.mode === "regions";
    const regionCode = String(request.data?.regionCode ?? "");
    const pageNo = Number(request.data?.pageNo ?? 1);

    if (!isRegionList && (!/^\d{2}$/.test(regionCode) || !Number.isInteger(pageNo) || pageNo < 1 || pageNo > 100)) {
      throw new HttpsError("invalid-argument", "지역 코드 또는 페이지 번호가 올바르지 않아요.");
    }

    const endpoint = isRegionList ? "ldongCode2" : "areaBasedList2";
    const url = new URL(`https://apis.data.go.kr/B551011/KorService2/${endpoint}`);
    const parameters = {
      serviceKey: tourApiKey.value(),
      MobileOS: "WEB",
      MobileApp: "TourFavoritesWeb",
      _type: "json",
      numOfRows: isRegionList ? "100" : "12",
      pageNo: isRegionList ? "1" : String(pageNo)
    };
    if (isRegionList) {
      parameters.lDongListYn = "N";
    } else {
      parameters.lDongRegnCd = regionCode;
      parameters.contentTypeId = "12";
      parameters.arrange = "O";
    }
    url.search = new URLSearchParams(parameters).toString();

    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    } catch (error) {
      console.error("관광정보 네트워크 오류:", error.message);
      throw new HttpsError("unavailable", "관광정보 서버에 연결하지 못했어요.");
    }

    if (!response.ok) {
      console.error("관광정보 HTTP 오류:", response.status);
      throw new HttpsError("unavailable", `관광정보 API HTTP 오류: ${response.status}`);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      console.error("관광정보 JSON 해석 오류:", error.message);
      throw new HttpsError("failed-precondition", "관광정보 API가 JSON으로 응답하지 않았어요. 인증키 승인 상태를 확인해주세요.");
    }

    const data = payload.response ?? payload;
    const header = data.header ?? {};
    if (header.resultCode && header.resultCode !== "0000" && header.resultCode !== "00") {
      console.error("관광정보 서비스 오류:", header.resultCode, header.resultMsg);
      throw new HttpsError("failed-precondition", `관광정보 서비스 오류: ${header.resultCode} ${header.resultMsg || ""}`);
    }
    if (!data.body) {
      console.error("관광정보 비정상 응답:", JSON.stringify(payload).slice(0, 500));
      throw new HttpsError("failed-precondition", "관광정보 응답이 비정상적이에요. 인증키와 서비스 신청 상태를 확인해주세요.");
    }

    const raw = data.body.items?.item ?? [];
    const rows = Array.isArray(raw) ? raw : [raw];

    if (isRegionList) {
      const regions = rows.map((x) => ({
        code: String(x.code || x.lDongRegnCd || ""),
        name: String(x.name || x.lDongRegnNm || "")
      })).filter((x) => /^\d{2}$/.test(x.code) && x.name);
      return { regions };
    }

    const items = rows.filter(x => x && x.contentid && x.title).map((x) => ({
      id: String(x.contentid),
      title: String(x.title),
      address: [x.addr1, x.addr2].filter(Boolean).join(" "),
      image: String(x.firstimage || x.firstimage2 || "")
    }));

    return {
      items,
      totalCount: Number(data.body.totalCount) || 0
    };
  }
);

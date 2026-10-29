// --- Biến toàn cục ---
let foodDatabase = []; 
// Khoá phải khớp với cái mà calculateMetrics() ghi vào (p / l / c),
// nếu không updateSummary() và chatbot sẽ đọc phải undefined.
let targets = { kcal: 0, p: 0, l: 0, c: 0 };
let dailyLog = { sang: [], trua: [], toi: [] }; 

// Tải dữ liệu JSON và Phục hồi dữ liệu cũ khi mở web
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('./food_data.json');
        foodDatabase = await response.json();
        console.log("Database sẵn sàng!");
        
        // GỌI HÀM PHỤC HỒI DỮ LIỆU TỪ TRÌNH DUYỆT
        loadData(); 
        fetchServerProfile();
    } catch (error) {
        console.error("Lỗi tải JSON:", error);
    }
});


// --- TÍNH NĂNG MỚI: LƯU DỮ LIỆU VÀO TRÌNH DUYỆT ---
function loadData() {
    const savedUserInfo = localStorage.getItem('nutrition_userInfo');
    const savedTargets = localStorage.getItem('nutrition_targets');
    const savedDailyLog = localStorage.getItem('nutrition_dailyLog');

    if (savedUserInfo) {
        try {
            const userInfo = JSON.parse(savedUserInfo);
            if (document.getElementById('fullname')) document.getElementById('fullname').value = userInfo.name || '';
            if (document.getElementById('age')) document.getElementById('age').value = userInfo.age || '';
            if (document.getElementById('height')) document.getElementById('height').value = userInfo.height || '';
            if (document.getElementById('weight')) document.getElementById('weight').value = userInfo.weight || '';
            if (document.getElementById('gender')) document.getElementById('gender').value = userInfo.gender || 'nam';
            if (document.getElementById('activity')) document.getElementById('activity').value = userInfo.activity || '1.2';
        } catch(e) {}
    }
    
    if (savedTargets) {
        try { targets = JSON.parse(savedTargets); } catch(e) {}
    }
    
    if (savedDailyLog) {
        try {
            dailyLog = JSON.parse(savedDailyLog);
            if (typeof renderMeal === 'function') {
                renderMeal('sang');
                renderMeal('trua');
                renderMeal('toi');
                updateSummary();
            }
        } catch(e) {}
    }
}

// --- CẬP NHẬT HÀM LƯU DỮ LIỆU (Có thêm Họ và tên) ---
function saveData() {
    const userInfo = {
        name: document.getElementById('fullname').value, // Lưu tên
        age: document.getElementById('age').value,
        height: document.getElementById('height').value,
        weight: document.getElementById('weight').value,
        gender: document.getElementById('gender').value,
        activity: document.getElementById('activity').value
    };
    localStorage.setItem('nutrition_userInfo', JSON.stringify(userInfo));
    localStorage.setItem('nutrition_targets', JSON.stringify(targets));
    localStorage.setItem('nutrition_dailyLog', JSON.stringify(dailyLog));
}

// --- 1. Tính toán BMI & Mục tiêu ---
function calculateMetrics() {
    const heightCm = parseFloat(document.getElementById('height').value);
    const weight = parseFloat(document.getElementById('weight').value);
    const age = parseInt(document.getElementById('age').value);
    const gender = document.getElementById('gender').value; 
    const activity = parseFloat(document.getElementById('activity').value);

    if (!heightCm || !weight || !age) {
        alert("Vui lòng nhập đủ thông tin cá nhân!"); return;
    }

    const heightM = heightCm / 100;
    const bmi = (weight / (heightM * heightM)).toFixed(1);
    const idealWeight = (heightCm - 100) * 0.9;

    let bmr = (10 * weight) + (6.25 * heightCm) - (5 * age);
    bmr += (gender === 'nam') ? 5 : -161;
    targets.kcal = Math.round(bmr * activity);

    let pRatio = (activity > 1.5) ? 2.0 : 1.5; 
    targets.p = Math.round(weight * pRatio);
    targets.l = Math.round((targets.kcal * 0.25) / 9);
    targets.c = Math.round((targets.kcal - (targets.p * 4) - (targets.l * 9)) / 4);

    document.getElementById('bmi-result').innerHTML = `<strong>BMI:</strong> ${bmi}`;
    document.getElementById('ideal-weight').innerHTML = `<strong>Cân nặng chuẩn:</strong> ~${idealWeight.toFixed(1)} kg`;
    document.getElementById('tdee-result').innerHTML = `
        <strong>Mục tiêu:</strong> ${targets.kcal} Kcal/ngày<br>
        <span style="font-size: 0.9em; font-weight: normal; color: #00796B;">
            (Protein: ${targets.p}g | Lipid: ${targets.l}g | Carb: ${targets.c}g)
        </span>
    `;

    // --- Bổ sung AI Đề xuất ---
    let suggestion = "";
    const disease = document.getElementById('disease')?.value || 'Không có';

    if (bmi < 18.5) {
        suggestion = "🤖 <b>AI Đề xuất:</b> Bạn đang ở mức thiếu cân. Nên <b>tăng cân</b> bằng cách bổ sung thêm dinh dưỡng và protein để đạt chỉ số BMI lý tưởng (18.5 - 24.9).";
    } else if (bmi < 25) {
        suggestion = "🤖 <b>AI Đề xuất:</b> Tuyệt vời! Bạn đang có một cơ thể cân đối. Hãy duy trì chế độ ăn hiện tại để <b>giữ dáng</b> và tăng cường sức khỏe.";
    } else if (bmi < 30) {
        suggestion = "🤖 <b>AI Đề xuất:</b> Bạn đang ở mức tiền béo phì. Nên cân nhắc <b>giảm cân</b> nhẹ bằng cách cắt giảm tinh bột/đường và tăng cường vận động.";
    } else {
        suggestion = "🤖 <b>AI Đề xuất:</b> Bạn đang ở mức béo phì. Nên có kế hoạch <b>giảm cân</b> tích cực và tham khảo ý kiến chuyên gia để tránh các bệnh lý liên quan.";
    }

    if (disease !== 'Không có') {
        suggestion += `<br><small style="color: #666;">⚠️ Lưu ý: Chế độ ăn cần đặc biệt chú ý đến bệnh nền <b>${disease}</b> của bạn.</small>`;
    }

    const suggestionEl = document.getElementById('bmi-suggestion');
    if (suggestionEl) {
        suggestionEl.innerHTML = suggestion;
        suggestionEl.style.display = 'block';
    }

    updateSummary();
    if(typeof saveData === "function") saveData();
    syncProfileAndTargets(); // đẩy PAL + chỉ tiêu (công thức 1-7) lên TiDB
}

// Đồng bộ hồ sơ (kèm activity_pal) rồi yêu cầu server tính & lưu nutrition_targets.
// Server là nơi tính chính thức; giá trị hiển thị ở client chỉ để xem tức thì.
async function syncProfileAndTargets() {
    const token = localStorage.getItem('token');
    if (!token) return;
    const gv = (id) => document.getElementById(id)?.value || null;
    const activitySel = document.getElementById('activity');
    try {
        await fetch('/api/user/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                name: gv('fullname'),
                phone: gv('phone'),
                age: gv('age'),
                gender: gv('gender'),
                height: gv('height'),
                weight: gv('weight'),
                disease: gv('disease'),
                avatar: null,
                activity_pal: activitySel ? parseFloat(activitySel.value) : null,
                pal_label: activitySel ? activitySel.options[activitySel.selectedIndex].text : null
            })
        });
        const r = await fetch('/api/user/targets', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (r.ok) {
            const t = await r.json();
            // Lấy lại con số chính thức từ server để client và CSDL không lệch nhau
            targets.kcal = t.tdee_kcal;
            targets.p = t.target_protein_g;
            targets.l = t.target_lipid_g;
            targets.c = t.target_carb_g;
            updateSummary();
            saveData();
        }
    } catch (e) { console.warn('Không đồng bộ được chỉ tiêu lên server:', e.message); }
}
// Biến tạm để lưu món đang muốn thêm nếu bị cảnh báo
let pendingFoodEntry = null;
let pendingMealType = null;

// Thêm món vào danh sách
async function addFood() {
    const mealType = document.getElementById('meal-type').value;
    const searchName = document.getElementById('food-search').value.trim();
    const weightGrams = parseFloat(document.getElementById('food-weight').value);

    const foodItem = foodDatabase.find(item => item.TenThucPham === searchName);

    if (!foodItem || !weightGrams) {
        alert("Hãy chọn món ăn từ gợi ý và nhập khối lượng!"); return;
    }

    const ratio = weightGrams / 100;
    const entry = {
        name: foodItem.TenThucPham,
        weight: weightGrams,
        kcal: Math.round(foodItem.Kcal * ratio),
        p: (foodItem.Protid_g * ratio).toFixed(1),
        l: (foodItem.Lipid_g * ratio).toFixed(1),
        c: (foodItem.Carb_g * ratio).toFixed(1)
    };

    // GỌI AI KIỂM TRA NGẦM TRƯỚC KHI THÊM
    const btn = document.querySelector('.btn-add-food');
    btn.innerHTML = 'Đang kiểm tra AI...';
    btn.disabled = true;

    const isSafe = await checkFoodWithAI(entry);

    btn.innerHTML = 'Thêm vào thực đơn';
    btn.disabled = false;

    if (isSafe !== true) {
        // Cảnh báo: Hiện Modal, chờ xác nhận
        pendingFoodEntry = entry;
        pendingMealType = mealType;
        document.getElementById('ai-alert-message').innerHTML = isSafe;
        document.getElementById('ai-alert-modal').style.display = 'flex';
        return;
    }

    // An toàn: Thêm thẳng vào
    executeAddFood(entry, mealType);
}

function forceAddFood() {
    if(pendingFoodEntry && pendingMealType) {
        // Người dùng bỏ qua cảnh báo Lớp 2 -> ghi vết 'user_override' để thống kê Bảng III
        dailyLog[pendingMealType].push(pendingFoodEntry);
        renderMeal(pendingMealType); updateSummary(); saveData();
        pushMealItemToServer(pendingFoodEntry, pendingMealType, 'user_override');
        document.getElementById('food-search').value = '';
        document.getElementById('food-weight').value = '';
        document.getElementById('ai-alert-modal').style.display = 'none';
        pendingFoodEntry = null;
        pendingMealType = null;
    }
}

function executeAddFood(entry, mealType) {
    dailyLog[mealType].push(entry);
    renderMeal(mealType);
    updateSummary();
    saveData();
    pushMealItemToServer(entry, mealType); // ghi vào meal_items => tính GL (9) và sai số calo (10)

    document.getElementById('food-search').value = '';
    document.getElementById('food-weight').value = '';
}

// Ghi một món vào CSDL. Server tự tra GI từ bảng foods và tính lại GL.
async function pushMealItemToServer(entry, mealType, guardrailFlag = 'none') {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        await fetch('/api/user/meals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                log_date: new Date().toISOString().slice(0, 10),
                items: [{
                    food_name_raw: entry.name,
                    grams: entry.weight,
                    meal_slot: mealType,
                    origin: 'user',
                    guardrail_flag: guardrailFlag,
                    kcal: entry.kcal, protein_g: entry.p, lipid_g: entry.l, carb_g: entry.c
                }]
            })
        });
    } catch (e) { console.warn('Không ghi được món lên server:', e.message); }
}

// GUARDRAIL LỚP 2 — AI VERIFICATION (tau = 0.1, max_tokens = 100)
// Gọi qua proxy /api/chat/generate của server (server giữ GROQ_API_KEY),
// KHÔNG gọi thẳng Groq từ trình duyệt.
async function checkFoodWithAI(entry) {
    const getDisease = () => document.getElementById('disease')?.value || 'Không có';
    const disease = getDisease();
    if (disease === 'Không có') return true; // Không có bệnh nền thì mặc định an toàn

    const prompt = `Bạn là hệ thống kiểm duyệt y tế tự động.
Bệnh nhân có bệnh nền: ${disease}
Bệnh nhân đang định ăn món: ${entry.name} (${entry.weight}g).

Nhiệm vụ: Dựa trên kiến thức y khoa, món ăn này có vi phạm nghiêm trọng khuyến cáo ăn uống của bệnh "${disease}" không? (Ví dụ bệnh gút ăn thịt đỏ, tiểu đường ăn nhiều đường).

- Nếu hoàn toàn an toàn hoặc vi phạm rất nhẹ: CHỈ TRẢ VỀ CHỮ "SAFE"
- Nếu vi phạm (có rủi ro): Trả về câu cảnh báo ngắn gọn (dưới 30 chữ) giải thích tại sao không nên ăn.`;

    try {
        const response = await fetch('/api/chat/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: "user", content: prompt }],
                systemPrompt: "Bạn là hệ thống kiểm duyệt an toàn y khoa. Chỉ trả về 'SAFE' hoặc một câu cảnh báo ngắn.",
                disease: disease,
                temperature: 0.1, // tau = 0.1 theo bài báo
                max_tokens: 100
            })
        });

        if (!response.ok) return true; // Lỗi mạng thì cho qua
        const data = await response.json();
        const reply = data.choices[0].message.content.trim();

        if (reply.includes("SAFE") || reply.length < 5) return true;
        return reply; // Trả về nội dung cảnh báo

    } catch (e) {
        return true; 
    }
}

// Vẽ danh sách món ăn
function renderMeal(mealType) {
    const listHtml = document.getElementById(`list-${mealType}`);
    listHtml.innerHTML = ''; 
    dailyLog[mealType].forEach((item, index) => {
        const li = document.createElement('li');
        li.className = 'food-item-row';
        li.innerHTML = `
            <div class="food-info">
                <strong>${item.name} (${item.weight}g)</strong><br>
                <small>${item.kcal}kcal | P:${item.p} | L:${item.l} | C:${item.c}</small>
            </div>
            <button class="delete-btn" onclick="deleteFood('${mealType}', ${index})">×</button>
        `;
        listHtml.appendChild(li);
    });
}

// Xóa món ăn
function deleteFood(mealType, index) {
    dailyLog[mealType].splice(index, 1);
    renderMeal(mealType);
    updateSummary();
    saveData(); // Lưu lại sau khi xóa món
}

// --- 3. Đánh giá Tổng quát ---
function updateSummary() {
    let totals = { kcal: 0, p: 0, l: 0, c: 0 };
    
    ['sang', 'trua', 'toi'].forEach(meal => {
        dailyLog[meal].forEach(e => {
            totals.kcal += e.kcal;
            totals.p += parseFloat(e.p);
            totals.l += parseFloat(e.l);
            totals.c += parseFloat(e.c);
        });
    });

    document.getElementById('summary-result').innerText = `${totals.kcal} / ${targets.kcal} Kcal`;
    document.getElementById('protein-summary').innerText = `🥗 P: ${totals.p.toFixed(1)}/${targets.p}g`;
    document.getElementById('lipid-summary').innerText = `🥑 L: ${totals.l.toFixed(1)}/${targets.l}g`;
    document.getElementById('carb-summary').innerText = `🍞 C: ${totals.c.toFixed(1)}/${targets.c}g`;
}

// --- 4. Xuất Excel ---
function exportToExcel() {
    if (dailyLog.sang.length === 0 && dailyLog.trua.length === 0 && dailyLog.toi.length === 0) {
        alert("Thực đơn trống!"); return;
    }

    // Lấy thông tin từ Form
    const name = document.getElementById('fullname').value || "Chưa cập nhật";
    const gender = document.getElementById('gender').options[document.getElementById('gender').selectedIndex].text;
    const age = document.getElementById('age').value || "...";
    const height = document.getElementById('height').value || "...";
    const weight = document.getElementById('weight').value || "...";
    const activity = document.getElementById('activity').options[document.getElementById('activity').selectedIndex].text;
    
    // Lấy chuỗi kết quả BMI
    const bmiText = document.getElementById('bmi-result').innerText || "BMI: ...";
    const idealWeightText = document.getElementById('ideal-weight').innerText || "Cân nặng chuẩn: ...";

    // Cấu trúc lại file Excel chuyên nghiệp hơn
    const data = [
        ["THỰC ĐƠN DINH DƯỠNG CÁ NHÂN"],
        ["Ngày lập:", new Date().toLocaleDateString('vi-VN')],
        [],
        ["--- HỒ SƠ CÁ NHÂN ---"],
        ["Họ và tên:", name],
        ["Giới tính:", gender, "Tuổi:", age],
        ["Chiều cao (cm):", height, "Cân nặng (kg):", weight],
        ["Vận động:", activity],
        [bmiText, idealWeightText],
        [],
        ["--- CHỈ SỐ MỤC TIÊU ---"],
        ["Calo (Kcal):", targets.kcal],
        ["Protein (g):", targets.p, "Lipid (g):", targets.l, "Carb (g):", targets.c],
        [],
        ["BỮA ĂN", "MÓN ĂN", "KHỐI LƯỢNG (g)", "KCAL", "PROTEIN (g)", "LIPID (g)", "CARB (g)"]
    ];

    // Thêm danh sách món ăn
    const meals = { "Sáng": "sang", "Trưa": "trua", "Tối": "toi" };
    let totalKcal = 0, totalP = 0, totalL = 0, totalC = 0;

    for (let label in meals) {
        const key = meals[label];
        dailyLog[key].forEach(item => {
            data.push([
                label.toUpperCase(), 
                item.name, 
                item.weight, 
                item.kcal, 
                parseFloat(item.p), 
                parseFloat(item.l), 
                parseFloat(item.c)
            ]);
            totalKcal += item.kcal;
            totalP += parseFloat(item.p);
            totalL += parseFloat(item.l);
            totalC += parseFloat(item.c);
        });
    }

    // Dòng tổng cộng cuối cùng
    data.push([]);
    data.push(["TỔNG CỘNG", "", "", totalKcal, totalP.toFixed(1), totalL.toFixed(1), totalC.toFixed(1)]);

    // Tạo và tùy chỉnh file Excel
    const ws = XLSX.utils.aoa_to_sheet(data);
    
    // Chỉnh độ rộng các cột trong Excel cho đẹp và không bị tràn chữ
    ws['!cols'] = [
        { wch: 20 }, // Cột Bữa ăn / Tiêu đề
        { wch: 35 }, // Cột Tên món ăn
        { wch: 15 }, // Khối lượng
        { wch: 12 }, // Kcal
        { wch: 12 }, // Protein
        { wch: 12 }, // Lipid
        { wch: 12 }  // Carb
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ho_So_Dinh_Duong");
    XLSX.writeFile(wb, "Ho_So_Dinh_Duong_Ca_Nhan.xlsx");
}

// --- 5. Autocomplete ---
document.getElementById('food-search').addEventListener('input', function() {
    const query = this.value.trim().toLowerCase();
    const list = document.getElementById('search-suggestions');
    list.innerHTML = '';
    if (query.length < 1) { list.style.display = 'none'; return; }
    const matches = foodDatabase.filter(i => i.TenThucPham.toLowerCase().includes(query)).slice(0, 10);
    if (matches.length > 0) {
        list.style.display = 'block';
        matches.forEach(m => {
            const li = document.createElement('li');
            li.innerText = m.TenThucPham;
            li.onclick = () => {
                document.getElementById('food-search').value = m.TenThucPham;
                list.style.display = 'none';
                document.getElementById('food-weight').focus();
            };
            list.appendChild(li);
        });
    }
});

async function fetchServerProfile() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const res = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const user = await res.json();
        if (user) {
            if (document.getElementById('fullname')) document.getElementById('fullname').value = user.name || '';
            if (document.getElementById('age')) document.getElementById('age').value = user.age || '';
            if (document.getElementById('height')) document.getElementById('height').value = user.height || '';
            if (document.getElementById('weight')) document.getElementById('weight').value = user.weight || '';
            if (document.getElementById('gender')) document.getElementById('gender').value = user.gender || 'nam';
            if (document.getElementById('disease')) document.getElementById('disease').value = user.disease || 'Không có';
            if (user.activity_pal && document.getElementById('activity')) {
                document.getElementById('activity').value = String(user.activity_pal);
            }
            calculateMetrics();
        }
    } catch (e) {}
}


// AUTO-GENERATED building + room data for UCSF BOSC asset capture.
// Buildings come from the Maximo 'List of Locations' export; 95 Kirkham
// (code 2264) additionally carries structured floor/room options so techs
// pick from real rooms. All other buildings use free-text floor/room.

export interface Building {
  code: string; // numeric/alpha building code used in location codes
  name: string; // human label (address / description)
}

// 253 buildings
export const BUILDINGS: Building[] = [
  { code: "17PARK", name: "Parking Lot - 17th & Folsom" },
  { code: "2003", name: "1322, 1324 -  3rd Ave Housing" },
  { code: "2005", name: "1320 3rd Ave Housing" },
  { code: "2011", name: "50 Kirkham St, Housing" },
  { code: "2012", name: "Campus Library (Kalmanovitz), 530 Parnassus Ave" },
  { code: "2017", name: "374 Parnassus Ave" },
  { code: "2018", name: "MT Zion Bldg A, 1600 Divisadero" },
  { code: "2019", name: "MT Zion Bldg B, 1600 Divisadero" },
  { code: "2020", name: "UC-MTZ 2330 Post" },
  { code: "2021", name: "1490 5th Ave, Housing" },
  { code: "2022", name: "MT Zion Bldg C, 2200 Post" },
  { code: "2023", name: "MT ZION BLDG D, 1600 Divisadero" },
  { code: "2024", name: "MT ZION BLDG E, 1657 Scott St" },
  { code: "2026", name: "MT ZION BLDG G, 1675 Scott St" },
  { code: "2027", name: "MT Zion Bldg H" },
  { code: "2028", name: "1478-80 5th Ave, 1480, 1478, Housing" },
  { code: "2029", name: "1472-74 5th Ave, 1472, 1474, Housing" },
  { code: "2030", name: "1482 5th Ave, Housing" },
  { code: "2031", name: "MT Zion Bldg J, 2356 Sutter St" },
  { code: "2032", name: "FACULTY ALUMNI HOUSE FAH, 745 Parnassus Ave" },
  { code: "2033", name: "MT Zion Bldg N, 2255 Post St." },
  { code: "2034", name: "MT ZION BLDG P, 2375 Post St" },
  { code: "2035", name: "MT ZION BLDG R, 1600 Divisadero" },
  { code: "2036", name: "UC-MTZ 1701 Divisadero" },
  { code: "2037", name: "MT Zion Cancer Research, 2340 Sutter, MZRC" },
  { code: "2046", name: "1442 5th Ave, Housing" },
  { code: "2053", name: "1468 5th Ave, Housing" },
  { code: "2054", name: "1464 5th Ave, Housing" },
  { code: "2056", name: "1454 5th Ave, Housing" },
  { code: "2058", name: "1440 5th Ave, Housing" },
  { code: "2059", name: "1432-34 5th Ave, 1434, Housing" },
  { code: "2060", name: "1460 5th Ave, Housing" },
  { code: "2061", name: "1420 5th Ave, Housing" },
  { code: "2062", name: "1422-24 5th Ave, 1422 1424, Housing" },
  { code: "2063", name: "1414 5th Ave, Housing" },
  { code: "2064", name: "1452 5th Ave, Housing" },
  { code: "2065", name: "1428 5th Ave, Housing" },
  { code: "2212", name: "Millberry Union, 500 Parnassus Ave" },
  { code: "2213", name: "Ammonia Storage BLDG" },
  { code: "2215", name: "Woods Building WDS, 100 Medical Center Way" },
  { code: "2234", name: "INCINERATOR" },
  { code: "2251", name: "Clinical Sciences Building (CSB), 521 Parnassus Ave." },
  { code: "2252", name: "Medical Sciences Building, 513 Parnassus Ave" },
  { code: "2262", name: "1332 3rd Ave, Housing" },
  { code: "2263", name: "Medical Research 4, MR4" },
  { code: "2264", name: "95 Kirkham Street" },
  { code: "2267", name: "1344 3rd Ave, Housing" },
  { code: "2269", name: "1350 3rd Ave, Housing" },
  { code: "2271", name: "1338 3rd Ave, Housing" },
  { code: "2272", name: "1356 3rd Ave, Housing" },
  { code: "2273", name: "1362 3rd Ave, Housing" },
  { code: "2274", name: "Moffitt Hospital HCM" },
  { code: "2275", name: "Long Hospital, JML" },
  { code: "2276", name: "1326 3rd Ave - Housing" },
  { code: "2280", name: "UCH (UC Hall)" },
  { code: "2281", name: "Mission Hall MH, 550 16th St" },
  { code: "2290", name: "LPPI" },
  { code: "2291", name: "LPPI Butler Building" },
  { code: "2292", name: "LPPI PAINT SHED" },
  { code: "2308", name: "Aldea SMG 8, Housing, 105 Behr Ave" },
  { code: "2310", name: "Aldea SMG 10, HOUSING, 175 Johnstone" },
  { code: "2312", name: "Aldea SMG 12, Housing, 165 Johnstone Ave" },
  { code: "2313", name: "Aldea SMG 13 (All Aldea)" },
  { code: "2315", name: "Osher CTR (1545 Divisadero)" },
  { code: "2316", name: "Helen Diller Family Cancer Research HD, 1450 3rd St" },
  { code: "2325", name: "KORET VISION RESEARCH VRB" },
  { code: "2407", name: "UNIV House, 66 Johnstone Dr" },
  { code: "2408", name: "ACC (UC Clinics), 400 Parnassus Ave" },
  { code: "2410", name: "School of Nursing, 2 Koret Way" },
  { code: "2412", name: "DENTAL CLINICS BUILDING, SOD , School of Dentistry, 707 Parnassus Ave" },
  { code: "2414", name: "EH&S, 50 Medical Center Way EHS" },
  { code: "2415", name: "Mission Center Building (MCB), 1855 Folsom St" },
  { code: "2416", name: "CHILD CARE CENTER, LUCIA (610 Parn) CCC" },
  { code: "2417", name: "Hunters Pt BLDG 830 HPT, 75 Crisp Rd" },
  { code: "2418", name: "Oyster Point, OPT 612 Forbes Blvd SSF" },
  { code: "2420", name: "1486-88 5th Ave, 1486, 1488, Housing" },
  { code: "2430", name: "Surge Building SUR, 90 Medical Center Way" },
  { code: "2450", name: "Laurel Heights LHTS, 3333 California St" },
  { code: "2451", name: "Laurel Heights Annex LHTSA" },
  { code: "2870", name: "260 Newhall St" },
  { code: "2873", name: "Riverview Garden, Fresno" },
  { code: "2878", name: "1930 Market St" },
  { code: "2886", name: "405 Irving St" },
  { code: "2887", name: "1515 Scott St" },
  { code: "2888", name: "2186 Geary Blvd" },
  { code: "2889", name: "45 Castro St, DAVIES MED CTR" },
  { code: "2891", name: "432-A Irving St" },
  { code: "2895", name: "2211 Post St" },
  { code: "2901", name: "1294 9th Ave" },
  { code: "2902", name: "SFGH BLDG 3" },
  { code: "2903", name: "SFGH BLDG 9" },
  { code: "2904", name: "SFGH BLDG 80" },
  { code: "2905", name: "SFGH BLDG 90" },
  { code: "2906", name: "SFGH BLDG 100" },
  { code: "2910", name: "2789 25th St" },
  { code: "2924", name: "515 Spruce St" },
  { code: "2925", name: "3130 20th St" },
  { code: "2932", name: "SFGH Bldg 5" },
  { code: "2939", name: "SFGH BLDG 10" },
  { code: "2940", name: "1318-20 7th Ave" },
  { code: "2941", name: "3330 Geary Blvd" },
  { code: "2947", name: "2501 Ocean Ave, Lakeside Ctr" },
  { code: "2949", name: "150-250 Executive Park Blvd" },
  { code: "2950", name: "SFGH BLDG 30" },
  { code: "2951", name: "SFGH BLDG 40" },
  { code: "2952", name: "333 Gellert Ave, Daly City" },
  { code: "2953", name: "3180 18th St" },
  { code: "2954", name: "3313 North Hilliard, Fresno" },
  { code: "2957", name: "SFGH BLDG 1" },
  { code: "2958", name: "1635 Divisadero St" },
  { code: "2965", name: "350 Parnassus Ave" },
  { code: "2966", name: "296 Lawrence St, SSF" },
  { code: "2967", name: "625 Potrero Ave" },
  { code: "2971", name: "2380 Sutter St" },
  { code: "2972", name: "2233 Post St" },
  { code: "2980", name: "1569 Sloat Ave" },
  { code: "2988", name: "SFGH BLDG 20" },
  { code: "3000", name: "PARNASSUS SERVICES BLDG PSSRB, PSB, 30 Medical Center Way" },
  { code: "3001", name: "Rock Hall  RH 19B, 1550 4th St" },
  { code: "3002", name: "Genentech Hall GH 24, 600 16th street" },
  { code: "3003", name: "MB Community Ctr (Rutter/21B) MBCC, 1675 Owens St" },
  { code: "3004", name: "MZ Cancer Outpatient Clinic" },
  { code: "3006", name: "CENTRAL UTILITIES PLANT CUP, 25 Medical Center Way" },
  { code: "3008", name: "HEALTH SCIENCES EAST HSE, 513 Parnassus Ave" },
  { code: "3009", name: "HEALTH SCIENCES WEST HSW, 513 Parnassus Ave" },
  { code: "3010", name: "Buchanan Street Dental Clinic BDC, 100 Buchanan St" },
  { code: "3011", name: "Hunters Pt BLDG 831 HPT, 75 Crisp Rd" },
  { code: "3013", name: "145 Irving St - Housing" },
  { code: "3014", name: "Aldea SMG 1, Housing, 50 Johnstone Drive" },
  { code: "3016", name: "Aldea SMG 11, Housing, 90 Behr" },
  { code: "3019", name: "Aldea SMG 14, Housing, 80 Behr Ave" },
  { code: "3020", name: "Aldea SMG 2, 45 Johnstone, Housing" },
  { code: "3021", name: "Aldea SMG 3, Housing, 75 Behr Ave" },
  { code: "3022", name: "Aldea SMG 4, Housing, 20 Adolph Sutro Ct" },
  { code: "3023", name: "Aldea SMG 5, Housing, 85 Behr Ave, Student/Faculty" },
  { code: "3024", name: "Aldea SMG 6, Housing, 30 Adolph Sutro Ct" },
  { code: "3025", name: "Aldea SMG 7, Housing, 95 Behr Ave" },
  { code: "3029", name: "UC Fresno Medical Edu Bldg, 155 North Fresno St., Fresno, CA" },
  { code: "3031", name: "Mission Bay Rutter Community Center Parking Garage, 1625 Owens St., BLDG 21A" },
  { code: "3032", name: "MB Housing Bldg 20 (All Sites)" },
  { code: "3033", name: "2325 Post St Parking Garage" },
  { code: "3034", name: "Byers Hall  BH QB3, 600 16th Street" },
  { code: "3035", name: "Mission Bay Housing West, 1505 4th Street" },
  { code: "3036", name: "Mission Bay Housing South, 550 Gene Friend Way" },
  { code: "3037", name: "Mission Bay Housing North, 525 Nelson Rising Lane" },
  { code: "3038", name: "Mission Bay Housing East, 1560 3rd Street Hearst" },
  { code: "3039", name: "KIRKHAM CHILD CARE CENTER CCK, 10 Kirkham St" },
  { code: "3040", name: "Mission Bay 3rd Street Parking Garage, 1650 3rd St, 23B" },
  { code: "3041", name: "Mission Bay Surface Parking 23A, 750 Nelson Rising Ln" },
  { code: "3042", name: "MB Sandler Neurosciences Bldg (19A) NS, 675 Nelson Rising Ln" },
  { code: "3043", name: "654 Minnesota St 654M" },
  { code: "3045", name: "Mission Bay CVRB 17A/B (Smith), 555 Mission Bay Boulevard South" },
  { code: "3046", name: "Mission Bay Central Power PLT,  1480 4th St" },
  { code: "3047", name: "STEM CELL RESEARCH (Dolby) IRM, 35 Medical Center Way" },
  { code: "3052", name: "Mission Bay Hospital, 1975 4th St" },
  { code: "3053", name: "MB Hospital Parking Garage, 1835 Owens" },
  { code: "3054", name: "Outpatient Building" },
  { code: "3055", name: "Mission Bay Energy Center" },
  { code: "3062", name: "2420 Sutter Parking MZG" },
  { code: "3063", name: "Campus Support Services, CSS, formerly RAD Lab, 8 Koret Way" },
  { code: "3064", name: "Tidelands at 600 Minnesota, Housing" },
  { code: "3065", name: "Tidelands at 590 Minnesota, Housing" },
  { code: "3066", name: "566 Minnesota" },
  { code: "3067", name: "580 Minnesota" },
  { code: "3068", name: "615 Indiana" },
  { code: "3073", name: "MB Precision Cancer Medical Building, 1825 4th St" },
  { code: "3074", name: "777 Mariposa St" },
  { code: "3078", name: "Nancy Friend Pritzker Psychiatry Building, 675 18th St (previously 2130 3rd Street)" },
  { code: "3079", name: "UCSF Pride Hall/ZSFG BLDG 7, 2540 23rd St." },
  { code: "3080", name: "Wayne & Gladys Valley Center for Vision (WGVCV/CVN), 490 Illinois St., Block 33" },
  { code: "3083", name: "Mission Bay Child Care 727 Nelson Rising Lane" },
  { code: "3112", name: "Weill Neurosciences Building (WNS), 1651 4th Street, Block 23A" },
  { code: "3113", name: "2130 Post Street, Housing" },
  { code: "3115", name: "Bayfront Medical Building, 520 Illinois St, Block 34" },
  { code: "3117", name: "590 Illinois Parking Garage/B34 Garage" },
  { code: "3119", name: "(PRAB) Barbara and Gerson Bakar Research & Academic Building" },
  { code: "3121", name: "900 Hyde Bldg 68 (St Francis Memorial)" },
  { code: "3123", name: "MOB @ 1199 Bush - UCSF Hyde Hospital" },
  { code: "3124", name: "1234 Pine Street - Hyde Hospital Parking Garage" },
  { code: "3126", name: "450 Stanyan Street - UCSF Stanyan Hospital (Formerly St Mary's Medical Center)" },
  { code: "3127", name: "UCSF Stanyan Hospital McCauley Bldg (Formerly St Mary's)" },
  { code: "3128", name: "2250 Hayes Street Lot (UCSF Stanyan Hospital)" },
  { code: "3129", name: "UCSF Stanyan Sister Mary Philippa Clinic (2235 Hayes)" },
  { code: "3136", name: "409 Illinois St." },
  { code: "3250", name: "155 Johnstone Dr Aldea Community Center" },
  { code: "3512", name: "1145 Bush St" },
  { code: "3513", name: "2727 Mariposa St" },
  { code: "3514", name: "185 Berry St China Basin" },
  { code: "3520", name: "2300 Harrison" },
  { code: "3522", name: "50 Beale St" },
  { code: "3523", name: "550 East Shaw Ave, Fresno" },
  { code: "3525", name: "1300 South Eliseo, Greenbrae" },
  { code: "3526", name: "2 Upper Ragsdale, Monterey" },
  { code: "3527", name: "2585 Freeport Rd, Pittsburg" },
  { code: "3528", name: "3360 Geary Blvd" },
  { code: "3529", name: "815 Hyde St" },
  { code: "3530", name: "964 Market St" },
  { code: "3531", name: "982 Mission" },
  { code: "3536", name: "1100 South Eliseo, Greenbrae" },
  { code: "3537", name: "220 Montgomery St" },
  { code: "3541", name: "870 Dubuque Ave, SSF" },
  { code: "3545", name: "1500 Owens St" },
  { code: "3551", name: "1550 Bryant" },
  { code: "3552", name: "3490 California St" },
  { code: "3553", name: "3450 California St" },
  { code: "3556", name: "2320 Sutter St." },
  { code: "3562", name: "3575 Geary Blvd." },
  { code: "3563", name: "499 Illinois St." },
  { code: "3564", name: "Medical Group Business - 2000 Powell Street, Emeryville" },
  { code: "3567", name: "6425 Christie Avenue, Emeryville CA, 94608" },
  { code: "3569", name: "1725 Montgomery St." },
  { code: "3576", name: "5180 N Primativo Way" },
  { code: "3577", name: "6475 Christie Avenue, Emeryville" },
  { code: "3579", name: "2655 Bush Street" },
  { code: "3582", name: "5924 Stoneridge Dr., Pleasanton, CA" },
  { code: "3584", name: "1 Daniel Burnham Court, San Francisco, CA" },
  { code: "3588", name: "8000 Marina Blvd" },
  { code: "3589", name: "180 Montgomery St." },
  { code: "3594", name: "2500 18th Street" },
  { code: "3623", name: "1100 Park Place, San Mateo" },
  { code: "3624", name: "Berkeley Outpatient Ctr, 3100 San Pablo Avenue (Leased)" },
  { code: "3627", name: "2001 The Embarcadero/2 North Point (2NP)" },
  { code: "3632", name: "2001 3rd Street" },
  { code: "3635", name: "100-230 De Anza Blvd., San Mateo - Cancer Care Svcs" },
  { code: "3639", name: "1100 Van Ness Ave" },
  { code: "3640", name: "290 Redwood Shores Parkway, Redwood City" },
  { code: "3642", name: "1800 Owens" },
  { code: "3643", name: "Pennisula Outpatient Ctr (POPC) Burlingame, 225 California Drive, Burlingame, CA 94010." },
  { code: "3647", name: "1263 Mission Street (Leased)" },
  { code: "6004", name: "MZ 1725 Scott Street" },
  { code: "6010", name: "Hunters Pt BLDG 75 Crisp Road" },
  { code: "6013", name: "925 Brockhurst" },
  { code: "6302", name: "Gladstone Institute, 1650 Owens Street" },
  { code: "7018", name: "MLK Research Building (OAK)/Childrens Hospital Oakland CHORI - 5700 MLK Jr Way, Oakland" },
  { code: "9300", name: "1111 Franklin St. (UCOP), Oakland" },
  { code: "9330", name: "UCOP House" },
  { code: "9557", name: "1100 Broadway St. (UCOP), Oakland" },
  { code: "BLOCK14", name: "Block 14 Parking Lot - City of SF (6th St & Owens and Nelson Rising )" },
  { code: "BLOCK15", name: "Block 15 Parking Lot (5th & 6th St and Nelson Rising & MB Blvd S)" },
  { code: "BLOCK16", name: "Block 16 Parking Lot - Next to MB Child Care (6th St and Nelson Rising )" },
  { code: "BLOCK18", name: "Block 18 Parking Lot - next to MBPlant (5th St and Nelson Rising & MB Blvd S)" },
  { code: "GENEFRIENDWAY", name: "Gene Friend Way, Mission Bay (between 3rd St & 4th St)" },
  { code: "KORETQUAD", name: "Koret Quad, Mission Bay" },
  { code: "LH", name: "Laurel Heights" },
  { code: "MB", name: "Mission Bay" },
  { code: "MBGLAD", name: "Mission Bay Gladstone Bldg." },
  { code: "MBGRND", name: "Mission Bay Grounds" },
  { code: "MCB", name: "Mission Center Building" },
  { code: "MZ", name: "Mt Zion" },
  { code: "OLA", name: "Outlying Areas" },
  { code: "PN", name: "Parnassus" },
  { code: "PNGRND", name: "Parnassus Grounds" },
  { code: "SAUND", name: "Saunders Court, Parnassus" },
];

// building code -> { floorCode -> room codes }. Only buildings with a
// verified room list appear here; everything else falls back to free text.
export const STRUCTURED_ROOMS: Record<string, Record<string, string[]>> = {
  "2264": {
    "00": ["B-00", "B-01", "B-02", "B-03", "B-04", "B-07", "B-08", "B-09", "B-C1", "B-M2"],
    "01": ["101", "102", "103", "104", "104B", "104C", "105", "106", "107", "108", "118A", "1C1", "1L1", "1S1", "1T1", "1U1"],
    "02": ["201", "202", "203", "204", "204A", "205", "206", "207", "207A", "207B", "208", "209", "210", "212", "213A", "213X", "215", "216", "217", "218", "218A", "218B", "218C", "219", "220", "221", "223", "224X", "225", "227", "228", "229", "230", "231", "2C1", "2C2", "2J1", "2S1", "2S2", "2T1", "2U1", "2U2"],
    "03": ["301", "301A", "302", "302A", "302B", "303", "304", "305", "306", "307", "307A", "307B", "308", "309", "310", "311", "312", "313", "313A", "314", "315", "316", "317", "317A", "318", "318A", "318B", "318C", "3C1", "3C2", "3S1", "3S2", "3T1", "3U1"],
  },
};

/** All buildings, optionally overridden by NEXT_PUBLIC_BUILDINGS
 *  ("2252:Medical Sciences,3008:Health Sciences West"). */
export function getBuildings(): Building[] {
  const env = process.env.NEXT_PUBLIC_BUILDINGS;
  if (env && env.trim()) {
    const parsed = env
      .split(",")
      .map((chunk) => chunk.split(":").map((s) => s.trim()))
      .filter((parts) => parts[0])
      .map(([code, name]) => ({ code, name: name || code }));
    if (parsed.length) return parsed;
  }
  return BUILDINGS;
}

/** Case-insensitive search over building code and name. Empty query returns
 *  the full list so the picker can show everything on first open. */
export function searchBuildings(query: string, limit = 60): Building[] {
  const q = query.trim().toLowerCase();
  if (!q) return getBuildings().slice(0, limit);
  const out: Building[] = [];
  for (const b of getBuildings()) {
    if (b.code.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)) {
      out.push(b);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Human label for a building code, or the raw code if unknown. */
export function buildingLabel(code: string): string {
  if (!code) return "";
  const b = getBuildings().find((x) => x.code === code);
  return b ? `${b.code} · ${b.name}` : code;
}

/** Returns { floorCode: rooms[] } for buildings with a verified room list,
 *  or null when the tech should free-type floor and room. */
export function getStructuredRooms(
  buildingCode: string,
): Record<string, string[]> | null {
  return STRUCTURED_ROOMS[buildingCode] ?? null;
}

/** Sorted floor codes for a structured building (e.g. ["00","01","02","03"]). */
export function getFloors(buildingCode: string): string[] {
  const s = STRUCTURED_ROOMS[buildingCode];
  return s ? Object.keys(s).sort() : [];
}

/** Sorted room codes for a given structured building + floor. */
export function getRooms(buildingCode: string, floor: string): string[] {
  const s = STRUCTURED_ROOMS[buildingCode];
  return s && s[floor] ? s[floor] : [];
}

/** Zero-pad a floor to two digits to match the UCSF code convention. */
export function padFloor(floor: string): string {
  const t = floor.trim();
  if (!t) return "";
  if (/^[a-z]$/i.test(t)) return t.toUpperCase();
  const n = t.replace(/\D/g, "");
  if (!n) return t.toUpperCase();
  return n.padStart(2, "0");
}

/** Assemble a location code from parts (e.g. 2264-01-104B). Empty until a
 *  building is chosen. Room is uppercased. Structured floors are already
 *  two-digit so padFloor leaves them intact. */
export function buildLocationCode(
  building: string,
  floor: string,
  room: string,
): string {
  if (!building) return "";
  const parts = [building.trim()];
  const f = padFloor(floor);
  const r = room.trim().toUpperCase();
  if (f) parts.push(f);
  if (r) parts.push(r);
  return parts.join("-");
}

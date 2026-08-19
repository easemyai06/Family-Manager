import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import dayjs from "dayjs";
import { AppText } from "./AppText";
import { useTheme } from "@/src/theme/ThemeContext";
import { spacing, radius } from "@/src/theme/tokens";

const WEEK = ["M", "T", "W", "T", "F", "S", "S"];

/* ------------------------------ Date field ------------------------------ */
export function DateField({
  label, value, onChange, placeholder = "Select date", testID,
  minYear, maxYear, maxToday = false, minToday = false,
}: {
  label?: string;
  value?: string | null;            // "YYYY-MM-DD"
  onChange: (iso: string) => void;
  placeholder?: string;
  testID?: string;
  minYear?: number;
  maxYear?: number;
  maxToday?: boolean;               // disallow future dates (birthdays)
  minToday?: boolean;               // disallow past dates (events / tasks)
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [showYears, setShowYears] = useState(false);
  const today = dayjs();
  const selected = value ? dayjs(value) : null;
  const [view, setView] = useState(() => (selected && selected.isValid() ? selected : today).startOf("month"));

  const loYear = minYear ?? (minToday ? today.year() : today.year() - 100);
  const hiYear = maxYear ?? today.year() + 5;
  const grid = useMemo(() => {
    const start = view.startOf("month");
    const firstCol = (start.day() + 6) % 7; // Monday-first index
    const daysInMonth = view.daysInMonth();
    const cells: (dayjs.Dayjs | null)[] = [];
    for (let i = 0; i < firstCol; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(view.date(d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [view]);

  const pick = (d: dayjs.Dayjs) => {
    onChange(d.format("YYYY-MM-DD"));
    setOpen(false);
  };

  const disabled = (d: dayjs.Dayjs) => (maxToday && d.isAfter(today, "day")) || (minToday && d.isBefore(today, "day"));

  return (
    <View>
      {label ? <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginBottom: 6 }}>{label}</AppText> : null}
      <Pressable onPress={() => setOpen(true)} style={[styles.field, { borderColor: c.border, backgroundColor: c.surface }]} testID={testID}>
        <Ionicons name="calendar-outline" size={18} color={c.onSurfaceSecondary} />
        <AppText size={15} color={value ? c.onSurface : c.onSurfaceTertiary} style={{ flex: 1 }}>
          {value ? dayjs(value).format("DD-MM-YYYY") : placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={18} color={c.onSurfaceTertiary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: c.surface }]} onPress={() => {}}>
            {/* header */}
            <View style={styles.calHeader}>
              <Pressable onPress={() => setView((v) => v.subtract(1, "month"))} hitSlop={10} testID="cal-prev">
                <Ionicons name="chevron-back" size={24} color={c.onSurface} />
              </Pressable>
              <Pressable onPress={() => setShowYears((s) => !s)} style={styles.monthTitle} testID="cal-title">
                <AppText family="display" weight="bold" size={18}>{view.format("MMMM YYYY")}</AppText>
                <Ionicons name={showYears ? "chevron-up" : "chevron-down"} size={16} color={c.onSurfaceSecondary} />
              </Pressable>
              <Pressable onPress={() => setView((v) => v.add(1, "month"))} hitSlop={10} testID="cal-next">
                <Ionicons name="chevron-forward" size={24} color={c.onSurface} />
              </Pressable>
            </View>

            {showYears ? (
              <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={styles.yearGrid}>
                {Array.from({ length: hiYear - loYear + 1 }, (_, i) => hiYear - i).map((y) => (
                  <Pressable key={y} onPress={() => { setView((v) => v.year(y)); setShowYears(false); }}
                    style={[styles.yearChip, { backgroundColor: y === view.year() ? c.brand : c.surfaceSecondary }]} testID={`cal-year-${y}`}>
                    <AppText size={14} weight={y === view.year() ? "bold" : "regular"} color={y === view.year() ? "#fff" : c.onSurface}>{y}</AppText>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <>
                <View style={styles.weekRow}>
                  {WEEK.map((w, i) => <AppText key={i} size={12} weight="bold" color={c.onSurfaceTertiary} style={styles.weekCell}>{w}</AppText>)}
                </View>
                <View style={styles.daysGrid}>
                  {grid.map((d, i) => {
                    if (!d) return <View key={i} style={styles.dayCell} />;
                    const isSel = selected && d.isSame(selected, "day");
                    const isToday = d.isSame(today, "day");
                    const dis = disabled(d);
                    return (
                      <Pressable key={i} disabled={dis} onPress={() => pick(d)}
                        style={[styles.dayCell]} testID={`cal-day-${d.date()}`}>
                        <View style={[styles.dayInner, isSel && { backgroundColor: c.brand }, !isSel && isToday && { borderWidth: 1.5, borderColor: c.brand }]}>
                          <AppText size={15} weight={isSel ? "bold" : "regular"} color={dis ? c.onSurfaceTertiary : isSel ? "#fff" : c.onSurface} style={dis ? { opacity: 0.4 } : undefined}>
                            {d.date()}
                          </AppText>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
                <Pressable onPress={() => { if (!disabled(today)) pick(today); }} style={styles.todayBtn} testID="cal-today">
                  <AppText size={14} weight="semibold" color={c.brand}>Today</AppText>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/* ------------------------------ Time field ------------------------------ */
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

export function TimeField({
  label, value, onChange, testID,
}: {
  label?: string;
  value?: string | null;   // "HH:MM" 24h
  onChange: (v: string) => void;
  testID?: string;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const parse = (v?: string | null) => {
    const m = (v || "").match(/^(\d{1,2}):(\d{2})$/);
    let h = m ? parseInt(m[1], 10) : 9;
    const mm = m ? parseInt(m[2], 10) : 0;
    const ap = h >= 12 ? "PM" : "AM";
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return { h12, mm: Math.round(mm / 5) * 5 % 60, ap };
  };
  const init = parse(value);
  const [h12, setH] = useState(init.h12);
  const [mm, setMM] = useState(init.mm);
  const [ap, setAP] = useState<"AM" | "PM">(init.ap as "AM" | "PM");

  const display = () => {
    if (!value) return "Select time";
    const p = parse(value);
    return `${p.h12}:${String(p.mm).padStart(2, "0")} ${p.ap}`;
  };

  const confirm = () => {
    let h24 = h12 % 12;
    if (ap === "PM") h24 += 12;
    onChange(`${String(h24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
    setOpen(false);
  };

  const Col = ({ items, sel, onSel, fmt, tid }: any) => (
    <ScrollView style={styles.timeCol} contentContainerStyle={{ paddingVertical: spacing.sm }} showsVerticalScrollIndicator={false}>
      {items.map((it: number) => (
        <Pressable key={it} onPress={() => onSel(it)} style={[styles.timeItem, it === sel && { backgroundColor: c.brand }]} testID={`${tid}-${it}`}>
          <AppText size={17} weight={it === sel ? "bold" : "regular"} color={it === sel ? "#fff" : c.onSurface}>{fmt(it)}</AppText>
        </Pressable>
      ))}
    </ScrollView>
  );

  return (
    <View>
      {label ? <AppText size={13} weight="semibold" color={c.onSurfaceSecondary} style={{ marginBottom: 6 }}>{label}</AppText> : null}
      <Pressable onPress={() => { const p = parse(value); setH(p.h12); setMM(p.mm); setAP(p.ap as any); setOpen(true); }} style={[styles.field, { borderColor: c.border, backgroundColor: c.surface }]} testID={testID}>
        <Ionicons name="time-outline" size={18} color={c.onSurfaceSecondary} />
        <AppText size={15} color={value ? c.onSurface : c.onSurfaceTertiary} style={{ flex: 1 }}>{display()}</AppText>
        <Ionicons name="chevron-down" size={18} color={c.onSurfaceTertiary} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: c.surface }]} onPress={() => {}}>
            <AppText family="display" weight="bold" size={18} center style={{ marginBottom: spacing.md }}>Pick a time</AppText>
            <View style={styles.timeRow}>
              <Col items={HOURS} sel={h12} onSel={setH} fmt={(n: number) => String(n)} tid="time-hour" />
              <Col items={MINUTES} sel={mm} onSel={setMM} fmt={(n: number) => String(n).padStart(2, "0")} tid="time-min" />
              <View style={styles.apCol}>
                {(["AM", "PM"] as const).map((a) => (
                  <Pressable key={a} onPress={() => setAP(a)} style={[styles.apBtn, { borderColor: c.border }, ap === a && { backgroundColor: c.brand, borderColor: c.brand }]} testID={`time-${a}`}>
                    <AppText size={15} weight="bold" color={ap === a ? "#fff" : c.onSurface}>{a}</AppText>
                  </Pressable>
                ))}
              </View>
            </View>
            <Pressable onPress={confirm} style={[styles.doneBtn, { backgroundColor: c.brand }]} testID="time-done">
              <AppText size={15} weight="bold" color="#fff">Done</AppText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 14, minHeight: 50 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: spacing.lg },
  sheet: { width: "100%", maxWidth: 380, borderRadius: 22, padding: spacing.lg },
  calHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  monthTitle: { flexDirection: "row", alignItems: "center", gap: 4 },
  weekRow: { flexDirection: "row" },
  weekCell: { width: `${100 / 7}%`, textAlign: "center" },
  daysGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: spacing.sm },
  dayCell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  dayInner: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  todayBtn: { alignSelf: "center", marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.xl },
  yearGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  yearChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, minWidth: 70, alignItems: "center" },
  timeRow: { flexDirection: "row", justifyContent: "center", gap: spacing.md, height: 200 },
  timeCol: { width: 72, borderRadius: radius.md },
  timeItem: { paddingVertical: 10, alignItems: "center", borderRadius: radius.md, marginVertical: 2 },
  apCol: { justifyContent: "center", gap: spacing.sm },
  apBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, alignItems: "center" },
  doneBtn: { marginTop: spacing.lg, paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
});

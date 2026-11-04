// Memuat ulang pengguna setiap permintaan agar perubahan peran/nonaktif langsung berlaku.
export async function loadSessionUser(db, id) {
  return db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true, sessionVersion: true },
  });
}

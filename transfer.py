import numpy as np


def compute_rigid_transform(P1, P2):
    """
    计算刚体变换 (R, t)，使得 P2 ≈ R @ P1 + t
    P1, P2: (N, 3) 的数组，至少 3 个不共线的对应点
    返回: R (3x3 旋转矩阵), t (3,) 平移向量
    使用 Kabsch 算法（SVD）求最优旋转
    """
    # 求质心
    c1 = P1.mean(axis=0)
    c2 = P2.mean(axis=0)

    # 去质心
    Q1 = P1 - c1
    Q2 = P2 - c2

    # 协方差矩阵
    H = Q1.T @ Q2

    # SVD
    U, S, Vt = np.linalg.svd(H)

    # 求旋转
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    D = np.diag([1.0, 1.0, d])
    R = Vt.T @ D @ U.T

    # 平移
    t = c2 - R @ c1

    return R, t


def solve_D2(A1, B1, C1, D1, A2, B2, C2):
    """
    已知 ABC 初始坐标 A1B1C1 和新坐标 A2B2C2，以及 D 的初始坐标 D1，
    求 D 在新状态下的坐标 D2。
    """
    A1 = np.array(A1, dtype=float)
    B1 = np.array(B1, dtype=float)
    C1 = np.array(C1, dtype=float)
    D1 = np.array(D1, dtype=float)

    A2 = np.array(A2, dtype=float)
    B2 = np.array(B2, dtype=float)
    C2 = np.array(C2, dtype=float)

    # 构造对应点集
    P1 = np.vstack([A1, B1, C1])
    P2 = np.vstack([A2, B2, C2])

    # 求刚体变换
    R, t = compute_rigid_transform(P1, P2)

    # 应用到 D1
    D2 = R @ D1 + t

    # 可选：验证 ABC 的变换误差
    P2_pred = (R @ P1.T).T + t
    err = np.linalg.norm(P2_pred - P2, axis=1)
    print("ABC 变换误差（应接近 0）:", err)

    return D2


if __name__ == "__main__":
    # ===== 在这里输入 7 个点的坐标 =====
    # 示例数据（可替换成你自己的）
    A1 = [0.0, 0.0, 0.0]
    B1 = [1.0, 0.0, 0.0]
    C1 = [0.0, 1.0, 0.0]
    D1 = [0.5, 0.5, 1.0]

    # 假设板子绕某轴旋转并平移后的新坐标（示例）
    A2 = [1.0, 2.0, 3.0]
    B2 = [1.0, 3.0, 3.0]      # AB 方向变成 +Y
    C2 = [0.0, 2.0, 3.0]      # AC 方向变成 -X

    D2 = solve_D2(A1, B1, C1, D1, A2, B2, C2)
    print("D2 坐标 =", D2)
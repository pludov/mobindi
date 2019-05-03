import { SucceededAstrometryResult } from '@bo/ProcessorTypes';


type RotationDefinition = {id: number; sign:number};

const RAD_PER_DEG = Math.PI / 180;
const DEG_PER_RAD = 180 / Math.PI;

function deg2rad(x: number): number {
    return x * RAD_PER_DEG;
}

function rad2deg(x: number): number {
    return x * DEG_PER_RAD;
}

// Radian ra/dec
function radec2xyzarr(ra: number, dec: number): number[] {
    const cosdec: number = Math.cos(dec);
    return [
        cosdec * Math.cos(ra),
        cosdec * Math.sin(ra),
        Math.sin(dec)
    ];
}

const j2000Epoch = new Date('2000-01-01T11:58:55.816Z').getTime() / 1000;

const raToRad = Math.PI / 180.0;
const decToRad = Math.PI / 180.0;
const degToRad = Math.PI / 180.0;
const radToDeg = 180.0 / Math.PI;
const epsilon = 1E-10;

const m11 = 0;
const m12 = 1;
const m13 = 2;
const m14 = 3;
const m21 = 4;
const m22 = 5;
const m23 = 6;
const m24 = 7;
const m31 = 8;
const m32 = 9;
const m33 = 10;
const m34 = 11;

const m11_99 = 0;
const m12_99 = 1;
const m13_99 = 2;
const m21_99 = 3;
const m22_99 = 4;
const m23_99 = 5;
const m31_99 = 6;
const m32_99 = 7;
const m33_99 = 8;

class AffineTransform3D {
    matrice: number[];
    constructor(matrice?: number[]) {
        if (matrice === undefined) {
            matrice = Array(12).fill(0);
            matrice[m11] = 1;
            matrice[m22] = 1;
            matrice[m33] = 1;
        }
        this.matrice = matrice;
    }

    public convert(input: number[]): number[] {
        const [x0, y0, z0] = input;

        return [
            this.matrice[m11] * x0 + this.matrice[m12] * y0 + this.matrice[m13] * z0 + this.matrice[m14],
            this.matrice[m21] * x0 + this.matrice[m22] * y0 + this.matrice[m23] * z0 + this.matrice[m24],
            this.matrice[m31] * x0 + this.matrice[m32] * y0 + this.matrice[m33] * z0 + this.matrice[m34]
        ];
    }

    public invert(): AffineTransform3D {
        const [
            m_11, m_12, m_13, m_14,
            m_21, m_22, m_23, m_24,
            m_31, m_32, m_33, m_34
        ] = this.matrice;

        const discri = ((m_11 * m_23 * m_32) - (m_11 * m_33 * m_22) + (m_12 * m_21 * m_33) - (m_12 * m_23 * m_31) + (m_13 * m_22 * m_31) - (m_13 * m_32 * m_21));

        if (discri === 0) throw new Error("cannot invert transformation");

        const result = new AffineTransform3D();
        // x0 *discri =
        // (x1*m_23*m_32) - (x1*m_22*m_33)
        // (m_12*m_33*y1) - (m_13*m_32*y1)
        // (m_13*m_22*z1) - (m_12*m_23*z1)
        // (m_12*m_23*m_34) - (m_12*m_33*m_24) - (m_13*m_22*m_34) + (m_13*m_32*m_24) - (m_14*m_23*m_32) + (m_14*m_22*m_33)		
        result.matrice[m11] = (m_23 * m_32) - (m_22 * m_33); // *x1
        result.matrice[m12] = (m_12 * m_33) - (m_13 * m_32); // *y1
        result.matrice[m13] = (m_13 * m_22) - (m_12 * m_23); // *z1
        result.matrice[m14] = (m_12 * m_23 * m_34) - (m_12 * m_33 * m_24) - (m_13 * m_22 * m_34) + (m_13 * m_32 * m_24) - (m_14 * m_23 * m_32) + (m_14 * m_22 * m_33);

        // y0 * discri =
        // (x1*m_21*m_33) - (x1*m_23*m_31) 
        // (m_13*m_31*y1) - (m_11*m_33*y1)
        // (m_11*m_23*z1) - (m_13*m_21*z1)
        // (m_11*m_33*m_24) - (m_11*m_23*m_34) + (m_14*m_23*m_31) - (m_14*m_21*m_33) - (m_13*m_31*m_24) + (m_13*m_21*m_34)
        result.matrice[m21] = (m_21 * m_33) - (m_23 * m_31);
        result.matrice[m22] = (m_13 * m_31) - (m_11 * m_33);
        result.matrice[m23] = (m_11 * m_23) - (m_13 * m_21);
        result.matrice[m24] = (m_11 * m_33 * m_24) - (m_11 * m_23 * m_34) + (m_14 * m_23 * m_31) - (m_14 * m_21 * m_33) - (m_13 * m_31 * m_24) + (m_13 * m_21 * m_34);

        // z0 * discri =
        // (x1*m_22*m_31) - (x1*m_21*m_32)
        // (m_11*m_32*y1) - (m_12*m_31*y1)
        // (m_12*m_21*z1) - (m_11*m_22*z1)
        // (m_14*m_21*m_32) - (m_14*m_22*m_31) + (m_12*m_31*m_24) - (m_12*m_21*m_34) - (m_11*m_32*m_24) + (m_11*m_22*m_34)
        result.matrice[m31] = (m_22 * m_31) - (m_21 * m_32);
        result.matrice[m32] = (m_11 * m_32) - (m_12 * m_31);
        result.matrice[m33] = (m_12 * m_21) - (m_11 * m_22);
        result.matrice[m34] = (m_14 * m_21 * m_32) - (m_14 * m_22 * m_31) + (m_12 * m_31 * m_24) - (m_12 * m_21 * m_34) - (m_11 * m_32 * m_24) + (m_11 * m_22 * m_34);

        const idiscri = 1.0 / discri;
        for (let i = 0; i < 12; ++i) {
            result.matrice[i] *= idiscri;
        }

        //		// De quoi tester ...
        //		double [] tmp1 = new double[3];
        //		double [] tmp2 = new double[3];
        //		double [] tmp3 = new double[3];
        //		
        //		for(int i = 0 ; i < 150; ++i)
        //		{
        //
        //			tmp1[0] = Math.random() * 2 - 1;
        //			tmp1[1] = Math.random() * 2 - 1;
        //			tmp1[2] = Math.random() * 2 - 1;
        //			
        //			this.convert(tmp1, 0, tmp2, 0, 1);
        //			
        //			result.convert(tmp2, 0, tmp3, 0, 1);
        //			
        //			double dx = tmp3[0] - tmp1[0];
        //			double dy = tmp3[1] - tmp1[1];
        //			double dz = tmp3[2] - tmp1[2];
        //			double dst = Math.sqrt(dx * dx + dy * dy + dz * dz);
        //			if (dst > 1E-8) {
        //				System.out.println("invert failed");
        //			}
        //		}

        return result;
    }

    static readonly unit = new AffineTransform3D();

}


/**
 * Map a time in hours to the range  0  to 24.
 * @param hour
 * @return modified hour
 */
function Map24(hour: number): number {
    let n;
    if (hour < 0.0) {
        n = Math.floor(hour / 24.0);
        return (hour - n * 24.0);
    }
    else if (hour >= 24.0) {
        n = Math.floor(hour / 24.0);
        return (hour - n * 24.0);
    }
    else {
        return (hour);
    }
}


/**
 * Map an angle in degrees to  0 <= angle < 360.
 * @param angle
 * @return modified angle in degrees
 */
export function Map360(angle: number): number {
    let n;
    if (angle < 0.0) {
        n = Math.floor(angle / 360.0);
        return (angle - n * 360.0);
    }
    else if (angle >= 360.0) {
        n = Math.floor(angle / 360.0);
        return (angle - n * 360.0);
    }
    else {
        return (angle);
    }
}



/**
 * Map an angle in degrees to -180 <= angle < 180.
 * @param angle
 * @return modified angle in degrees
 */
export function Map180(angle: number): number {
    let angle360;
    angle360 = Map360(angle);
    if (angle360 >= 180.0) {
        return (angle360 - 360.0);
    }
    else {
        return (angle360);
    }
}


export default class SkyProjection {
    // Size of a pixel (unit) in radian
    pixelRad: number;
    centerx: number;
    centery: number;
    transform: AffineTransform3D;
    invertedTransform: AffineTransform3D;

    constructor(pixelArcSec: number) {
        this.pixelRad = 2 * Math.PI * pixelArcSec / (3600 * 360);
        this.centerx = 0;
        this.centery = 0;
        this.transform = AffineTransform3D.unit;
        this.invertedTransform = AffineTransform3D.unit;
    }

    public setCenter(x: number, y: number) {
        this.centerx = x;
        this.centery = y;
    }

    public setTransform(af: AffineTransform3D) {
        this.transform = af;
        this.invertedTransform = af.invert();
    }

    /**
	 * Project a start on the 3D sphere
     * Alt: 0 = north, 90 = east
     * 
	 * In this projection, north pole is toward z axis (0,0,1). 
     * x axis points to the zenith
     * y axis points east
     */
    public static convertAltAzTo3D(i : {alt: number, az:number}) : number[] {
        let x = Math.sin(i.alt * degToRad);
        const cs = Math.cos(i.alt * degToRad)
        let z = cs * Math.cos(degToRad * i.az);
        let y = cs * Math.sin(degToRad * i.az);
        return [x, y, z];
    }

    /** xyz must be normalized */
    public static convert3DToAltAz(xyz : number[]):{alt: number, az:number} {
        const az = Map360(Math.atan2(xyz[1], xyz[2]) * radToDeg);
        const alt = Map180(Math.asin(xyz[0]) * radToDeg);
        return {alt,az};
    }

    /**
	 * Project a start on the 3D sphere
	 * In this projection, north pole is toward z axis (0,0,1). and ra=0 point to the x axis
	 * @param ra degrees
     * @param dec degrees
     * @return 3D array
	 */
    public static convertRaDecTo3D(i_radec: number[]): number[] {
        const [ra, dec] = i_radec;

        let x = Math.cos(raToRad * ra);
        let y = Math.sin(raToRad * ra);

        let zmul = Math.sin((90 - dec) * decToRad);
        let z = Math.cos((90 - dec) * decToRad);
        x *= zmul;
        y *= zmul;
        return [x, y, z];
    }

    /** Returns ra/dec as degrees */
    public static convert3DToRaDec(i_pt3d: number[]): number[] {
        const [x, y, z] = i_pt3d;

        // z = cos((90 - dec) * decToRad)
        // (90 - dec) * decToRad = cos-1(z)
        // (90 - dec) = cos-1(z) / decToRad
        // dec = 90 - cos-1(z) / decToRad
        const dec = 90 - Math.acos(z) / decToRad;
        let ra;
        if (x * x + y * y > epsilon * epsilon) {
            let raRad = Math.atan2(y, x);
            if (raRad < 0) raRad += 2 * Math.PI;
            ra = raRad / raToRad;
        } else {
            ra = 0;
        }

        return [ra, dec];
    }

    /**
	 * Compute distances in degrees between two points on the sky sphere
	 */
    public static getDegreeDistance(raDec1: number[], raDec2: number[]): number {
        const expected3d = SkyProjection.convertRaDecTo3D(raDec1);

        const found3d = SkyProjection.convertRaDecTo3D(raDec2);

        const dst = Math.sqrt(
            (expected3d[0] - found3d[0]) * (expected3d[0] - found3d[0])
            + (expected3d[1] - found3d[1]) * (expected3d[1] - found3d[1])
            + (expected3d[2] - found3d[2]) * (expected3d[2] - found3d[2]));

        const raAngle = Math.asin(dst / 2);
        const angle = raAngle * 180 / Math.PI;

        return angle;
    }

    /** Project RA/DEC (degrees) to the image (pixels). null if not visible */
    public raDecToPix(radec: number[]): number[] | null {
        let pos3d = SkyProjection.convertRaDecTo3D(radec);
        let [x, y, z] = this.transform.convert(pos3d);

        if (z < epsilon) {
            return null;
        }
        const iz = 1.0 / (this.pixelRad * z);
        x *= iz;
        y *= iz;
        x += this.centerx;
        y += this.centery;

        return [x, y];
    }

    // Get the size of the diagonal of an image from pixel unit
    public getFieldSize(width:number, height:number):number {
        const radw = this.pixelRad * (width + 1);
        const radh = this.pixelRad * (height + 1);
        return Math.sqrt(radw*radw + radh*radh) * 180/Math.PI;
    }

    /** Pixel => ra/dec (degrees) */
    public pixToRaDec(xy: number[]): number[] {
        const x = (xy[0] - this.centerx) * this.pixelRad;
        const y = (xy[1] - this.centery) * this.pixelRad;

        const z3d = 1.0 / Math.sqrt(y * y + x * x + 1.0);
        const x3d = x * z3d;
        const y3d = y * z3d;

        const pt3d = this.invertedTransform.convert([x3d, y3d, z3d]);
        return SkyProjection.convert3DToRaDec(pt3d);
    }

    public static fromAstrometry(input: SucceededAstrometryResult): SkyProjection {
        // Take r to be the threespace vector of crval
        const rxyz = radec2xyzarr(deg2rad(input.raCenter), deg2rad(input.decCenter));
        const rx = rxyz[0];
        const ry = rxyz[1];
        const rz = rxyz[2];

        // Form i = r cross north pole (0,0,1)
        let ix = ry;
        let iy = -rx;
        // iz = 0
        let norm = Math.sqrt(ix * ix + iy * iy);
        ix /= norm;
        iy /= norm;

        // Form j = i cross r;   iz=0 so some terms drop out
        let jx = iy * rz;
        let jy = - ix * rz;
        let jz = ix * ry - iy * rx;
        // norm should already be 1, but normalize anyway
        norm = Math.sqrt(jx * jx + jy * jy + jz * jz);
        jx /= norm;
        jy /= norm;
        jz /= norm;

        let r00 = ((- RAD_PER_DEG * (input.cd1_1) * ix) + RAD_PER_DEG * (input.cd2_1) * jx);
        let r01 = ((- RAD_PER_DEG * (input.cd1_2) * ix) + RAD_PER_DEG * (input.cd2_2) * jx);
        let r02 = rx;
        let r10 = ((- RAD_PER_DEG * (input.cd1_1) * iy) + RAD_PER_DEG * (input.cd2_1) * jy);
        let r11 = ((- RAD_PER_DEG * (input.cd1_2) * iy) + RAD_PER_DEG * (input.cd2_2) * jy);
        let r12 = ry;
        let r20 = (jz * RAD_PER_DEG * input.cd2_1);
        let r21 = (jz * RAD_PER_DEG * input.cd2_2);
        let r22 = rz;

        let pixelRadX = Math.sqrt(r00 * r00 + r10 * r10 + r20 * r20);
        let pixelRadY = Math.sqrt(r01 * r01 + r11 * r11 + r21 * r21);
        //			double scaleZ = Math.sqrt(r02 * r02 + r12 * r12 + r22 * r22);
        // System.out.println("got pixel rad x= " + pixelRadX + " soit " + rad2deg(pixelRadX) * 3600 + " arcsec");
        // System.out.println("got pixel rad y= " + pixelRadY + " soit " + rad2deg(pixelRadY) * 3600 + " arcsec");
        //			System.out.println("scale z = " + scaleZ);
        const transform = new AffineTransform3D([
            r00 / pixelRadX, r01 / pixelRadX, r02, 0,
            r10 / pixelRadX, r11 / pixelRadX, r12, 0,
            r20 / pixelRadX, r21 / pixelRadX, r22, 0
        ]);

        let pixArcSec = (3600 * 360) * pixelRadX / (2 * Math.PI);

        const skp = new SkyProjection(pixArcSec);
        skp.setCenter(input.refPixX, input.refPixY);
        skp.setTransform(transform.invert());
        return skp;
    }

    private static CalcJD(ny: number, nm: number, nd: number, ut: number) {
        let A, B, C, D, jd, day;

        day = nd + ut / 24.0;
        if ((nm == 1) || (nm == 2)) {
            ny = ny - 1;
            nm = nm + 12;
        }

        if (((ny + nm / 12.0 + day / 365.25)) >= (1582.0 + 10.0 / 12.0 + 15.0 / 365.25)) {
            A = Math.floor(ny / 100.0);
            B = 2.0 - A + Math.floor(A / 4.0);
        }
        else {
            B = 0.0;
        }

        if (ny < 0.0) {
            C = Math.floor((365.25 * ny) - 0.75);
        }
        else {
            C = Math.floor(365.25 * ny);
        }

        D = Math.floor(30.6001 * (nm + 1));
        jd = B + C + D + day + 1720994.5;
        return (jd);
    }

    private static JDEpoch(epochMs: number) {
        const d = new Date(epochMs);
        const [year, month, day, hours, minutes, seconds, milliseconds] =
            [
                d.getUTCFullYear(),
                d.getUTCMonth() + 1,
                d.getUTCDate(),
                d.getUTCHours(),
                d.getUTCMinutes(),
                d.getUTCSeconds(),
                d.getUTCMilliseconds()
            ];

        const ut = (milliseconds) / 3600000. +
            (seconds) / 3600. +
            (minutes) / 60. +
            (hours);

        return SkyProjection.CalcJD(year, month, day, ut);

    }

    private static getLeapSecForEpoch(epoch: number) {
        return 37;
    }

    private static PrecessJDToEpoch(epoch: number, jd: number, raDecIn: number[]): number[] {
        let ra_in, dec_in, ra_out, dec_out;
        let a, b, c;
        let zeta, z, theta;
        let T, t;
        let jdfixed;
        let radec: number[] = [0, 0];

        /* Fetch the input values for ra and dec */

        ra_in = raDecIn[0];
        dec_in = raDecIn[1];

        /* Convert to radians for use here */

        ra_in = ra_in * Math.PI / 12.;
        dec_in = dec_in * Math.PI / 180.;

        /* JD for the fixed epoch */

        jdfixed = (epoch - 2000.0) * 365.25 + 2451545.0;

        /* Julian centuries for the fixed epoch from a base epoch 2000.0 */

        T = (jd - 2451545.0) / 36525.0;

        /* Julian centuries for the jd from the fixed epoch */

        t = (jdfixed - jd) / 36525.0;

        /* Evaluate the constants in arc seconds */

        zeta = (2306.2181 + 1.39656 * T - 0.000139 * T * T) * t +
            (0.30188 - 0.000344 * T) * t * t +
            (0.017998) * t * t * t;

        z = (2306.2181 + 1.39656 * T - 0.000139 * T * T) * t +
            (1.09468 + 0.000066 * T) * t * t +
            (0.018203) * t * t * t;

        theta = (2004.3109 - 0.85330 * T - 0.000217 * T * T) * t +
            (-0.42665 - 0.000217 * T) * t * t +
            (-0.041833) * t * t * t;

        /* Convert to radians */

        zeta = zeta * Math.PI / (180. * 3600.);
        z = z * Math.PI / (180. * 3600.);
        theta = theta * Math.PI / (180. * 3600.);

        /* Calculate the precession */

        a = Math.sin(ra_in + zeta) * Math.cos(dec_in);
        b = Math.cos(ra_in + zeta) * Math.cos(theta) * Math.cos(dec_in) -
            Math.sin(theta) * Math.sin(dec_in);
        c = Math.cos(ra_in + zeta) * Math.sin(theta) * Math.cos(dec_in) +
            Math.cos(theta) * Math.sin(dec_in);
        if (c > 0.9) {
            dec_out = Math.acos(Math.sqrt(a * a + b * b));
        }
        else if (c < -0.9) {
            dec_out = -Math.acos(Math.sqrt(a * a + b * b));
        }
        else {
            dec_out = Math.asin(c);
        }
        ra_out = Math.atan2(a, b) + z;

        /* Convert back to hours and degrees */

        ra_out = ra_out * 12. / Math.PI;
        dec_out = dec_out * 180. / Math.PI;

        /* Check for range and adjust to -90 -> +90 and 0 -> 24 and if needed */

        if (dec_out > 90.) {
            dec_out = 180. - dec_out;
            ra_out = ra_out + 12.;
        }
        if (dec_out < -90.) {
            dec_out = -180. - dec_out;
            ra_out = ra_out + 12.;
        }

        ra_out = Map24(ra_out);

        /* Return ra and dec */

        return [ra_out, dec_out];

    }

    private static PrecessEpochToJD(epoch: number, jd: number, raDecIn: number[]): number[] {
        let ra_in, dec_in, ra_out, dec_out;
        let a, b, c;
        let zeta, z, theta;
        let T, t;
        let jdfixed;
        let radec = [0, 0];

        /* Fetch the input values for ra and dec and save in radians */

        ra_in = raDecIn[0];
        dec_in = raDecIn[1];

        /* Convert to radians for use here */

        ra_in = ra_in * Math.PI / 12.;
        dec_in = dec_in * Math.PI / 180.;

        /* Find zeta, z, and theta at this moment */

        /* JD for the fixed epoch */

        jdfixed = (epoch - 2000.0) * 365.25 + 2451545.0;


        /* Julian centuries for the fixed epoch from a base epoch 2000.0 */

        T = (jdfixed - 2451545.0) / 36525.0;

        /* Julian centuries for the jd from the fixed epoch */

        t = (jd - jdfixed) / 36525.0;

        /* Evaluate the constants in arc seconds */

        zeta = (2306.2181 + 1.39656 * T - 0.000139 * T * T) * t +
            (0.30188 - 0.000344 * T) * t * t +
            (0.017998) * t * t * t;

        z = (2306.2181 + 1.39656 * T - 0.000139 * T * T) * t +
            (1.09468 + 0.000066 * T) * t * t +
            (0.018203) * t * t * t;

        theta = (2004.3109 - 0.85330 * T - 0.000217 * T * T) * t +
            (-0.42665 - 0.000217 * T) * t * t +
            (-0.041833) * t * t * t;

        /* Convert to radians */

        zeta = zeta * Math.PI / (180. * 3600.);
        z = z * Math.PI / (180. * 3600.);
        theta = theta * Math.PI / (180. * 3600.);

        /* Calculate the precession */

        a = Math.sin(ra_in + zeta) * Math.cos(dec_in);
        b = Math.cos(ra_in + zeta) * Math.cos(theta) * Math.cos(dec_in) -
            Math.sin(theta) * Math.sin(dec_in);
        c = Math.cos(ra_in + zeta) * Math.sin(theta) * Math.cos(dec_in) +
            Math.cos(theta) * Math.sin(dec_in);
        if (c > 0.9) {
            dec_out = Math.acos(Math.sqrt(a * a + b * b));
        }
        else if (c < -0.9) {
            dec_out = -Math.acos(Math.sqrt(a * a + b * b));
        }
        else {
            dec_out = Math.asin(c);
        }
        ra_out = Math.atan2(a, b) + z;

        /* Convert back to hours and degrees */

        ra_out = ra_out * 12. / Math.PI;

        dec_out = dec_out * 180. / Math.PI;

        /* Check for range and adjust to -90 -> +90 and 0 -> 24 and if needed */

        if (dec_out > 90.) {
            dec_out = 180. - dec_out;
            ra_out = ra_out + 12.;
        }
        if (dec_out < -90.) {
            dec_out = -180. - dec_out;
            ra_out = ra_out + 12.;
        }

        ra_out = Map24(ra_out);

        /* Return ra and dec */
        return [ra_out, dec_out];
    }


    /**
     * Precession from Epoch to JD or back.
     * @param epoch  reference epoch (i.e. 2000.0)
     * @param jd  Julian Date of interest
     * @param ra  Right Ascension at reference epoch
     * @param dec  Declination at reference epoch
     * @param dirflag  +1 = precess from epoch to jd, -1 = precess from jd to epoch
     * @return Modified ra and dec as {ra,dec}
     */
    private static Precession(epoch: number, jd: number, radec: number[], dirflag: number): number[] {
        if (dirflag > 0) {
            return SkyProjection.PrecessEpochToJD(epoch, jd, radec);
        } else if (dirflag < 0) {
            return SkyProjection.PrecessJDToEpoch(epoch, jd, radec);
        } else {
            /* Return ra and dec */
            return radec;
        }
    }

    /**
     * Mean obliquity of the ecliptic for the Julian Date in degrees.
     * @param jd Julian Date
     * @param leapSecs Leap Seconds (TAI - UTC)
     * @return Mean Obliquity of the ecliptic in degrees
     */
    private static MeanObliquity(jd: number, leapSecs: number): number {
        let eps0;
        let dt, t;

        dt = leapSecs;
        dt += 32.184;

        /* Change units to centuries */

        dt /= (36525 * 24. * 60. * 60.);

        /* Julian centuries for the JD from a base epoch 2000.0 */

        t = (jd - 2451545.0) / 36525.0;

        /* Correct for dt = tdt - ut1 (not significant) */

        t += dt;

        /* Mean obliquity in degrees */

        eps0 = 23.0 + 26. / 60 + 21.448 / 3600.;
        eps0 += (- 46.8150 * t - 0.00059 * t * t + 0.001813 * t * t * t) / 3600.;

        return (eps0);
    }

    /**
     * Convert celestial to ecliptical coordinates for the Julian Date.
     *
     * @param jd Julian Date of interest
     * @param ra Right Ascension in hours
     * @param dec Declination in degrees
     * @param leapSecs Leap Seconds (TAI - UTC)
     * @return Ecliptical latitude and longitude as {elat, elong}
     */
    private static CelestialToEcliptical(jd: number, ra: number, dec: number, leapSecs: number): number[] {
        let elong, elat, eps;
        let elonglat = [0, 0];

        ra *= Math.PI / 12.;
        dec *= Math.PI / 180.;
        eps = SkyProjection.MeanObliquity(jd, leapSecs);
        eps = eps * Math.PI / 180;
        elong = Math.atan2(Math.sin(ra) * Math.cos(eps) + Math.tan(dec) * Math.sin(eps), Math.cos(ra));
        elong = Map360(elong * 180. / Math.PI);
        elat = Math.asin(Math.sin(dec) * Math.cos(eps) - Math.cos(dec) * Math.sin(eps) * Math.sin(ra));
        elat = Map180(elat * 180. / Math.PI);

        /* Test for hemisphere */

        if (elat > 90.) {
            elonglat[0] = Map360(elong + 180.);
            elonglat[1] = 180. - elat;
        }
        else if (elat < -90.) {
            elonglat[0] = Map360(elong + 180.);
            elonglat[1] = elat + 180;
        }
        else {
            elonglat[0] = elong;
            elonglat[1] = elat;
        }
        return elonglat;
    }

    /**
     * True geometric solar longitude for the JD in degrees.
     * @param jd Julian Date
     * @param leapSecs Leap Seconds (TAI - UTC)
     * @return True geometric solar longitude in degrees
     */
    private static LongitudeSun(jd: number, leapSecs: number): number {
        let lsun, glsun, msun, csun;
        let dt, t;

        dt = leapSecs;
        dt += 32.184;

        /* Change units to centuries */

        dt /= (36525 * 24. * 60. * 60.);

        /* Julian centuries for the EOD from a base epoch 2000.0 */

        t = (jd - 2451545.0) / 36525.0;

        /* Correct for dt = tt - ut1  */

        t += dt;

        lsun = Map360(280.46645 + 36000.76983 * t + 0.0003032 * t * t);

        /* Mean anomaly */

        msun = Map360(357.52910 + 35999.05030 * t - 0.0001559 * t * t -
            0.00000048 * t * t * t);

        msun = msun * Math.PI / 180.;

        /* Sun's center */

        csun = (1.9146000 - 0.004817 * t - 0.000014 * t * t) * Math.sin(msun)
            + (0.019993 - 0.000101 * t) * Math.sin(2. * msun)
            + 0.000290 * Math.sin(3. * msun);

        /* True geometric longitude */

        glsun = Map360(lsun + csun);

        return (glsun);
    }



    /**
     * Nutation of the longitude of the ecliptic for the EOD in degrees.
     * @param jd Julian Date
     * @param leapSecs Leap Seconds (TAI - UTC)
     * @return Nutation of the longitude of the ecliptic in degrees
     */
    private static NLongitude(jd: number, leapSecs: number): number {
        let dpsi, lsun, lmoon, omega;
        let dt, t;

        dt = leapSecs;
        dt += 32.184;

        /* Change units to centuries */

        dt /= (36525 * 24. * 60. * 60.);

        /* Julian centuries for the EOD from a base epoch 2000.0 */

        t = (jd - 2451545.0) / 36525.0;

        /* Correct for dt = tt - ut1  */

        t += dt;

        /* Longitude of the ascending node of the Moon's mean orbit */

        omega = Map360(125.04452 - 1934.136261 * t + 0.0020708 * t * t + t * t * t / 450000.);

        /* Mean longitude of the Moon */

        lmoon = Map360(218.31654591 + 481267.88134236 * t
            - 0.00163 * t * t + t * t * t / 538841. - t * t * t * t / 65194000.);

        /* Mean longitude of the Sun */

        lsun = SkyProjection.LongitudeSun(jd, leapSecs);

        /* Convert to radians */

        omega = omega * Math.PI / 180.;
        lsun = lsun * Math.PI / 180.;
        lmoon = lmoon * Math.PI / 180.;

        /* Nutation in longitude in seconds of arc for the EOD */

        dpsi = -17.20 * Math.sin(omega) - 1.32 * Math.sin(2. * lsun) -
            0.23 * Math.sin(2. * lmoon) + 0.21 * Math.sin(2. * omega);

        /* Convert to degrees */

        dpsi /= 3600.;

        return (dpsi);
    }

    /**
     * Convert ecliptical to celestial coordinates for the Julian Date.
     * @param jd Julian Date of interest
     * @param lambda Ecliptical longitude in degrees
     * @param beta Ecliptical latitude in degrees
     * @param leapSecs Leap Seconds (TAI - UTC)
     * @return RA and DEC as {ra, dec}
     */
    private static EclipticalToCelestial(jd: number, lambda: number, beta: number, leapSecs: number): number[] {
        let ra_out, dec_out, eps;
        let radec = [0, 0];
        lambda *= Math.PI / 180.;
        beta *= Math.PI / 180.;
        eps = SkyProjection.MeanObliquity(jd, leapSecs) * Math.PI / 180;
        ra_out = Math.atan2(Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lambda));
        ra_out = Map24(ra_out * 12. / Math.PI);
        dec_out = Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda));
        dec_out = Map180(dec_out * 180. / Math.PI);

        /* Test for hemisphere */

        if (dec_out > 90.) {
            radec[0] = Map24(ra_out + 12.);
            radec[1] = 180. - dec_out;
        }
        else if (dec_out < -90.) {
            radec[0] = Map24(ra_out + 12.);
            radec[1] = dec_out + 180;
        }
        else {
            radec[0] = ra_out;
            radec[1] = dec_out;
        }
        return radec;
    }


    /**
     * Nutation of the obliquity of the ecliptic for the EOD in degrees.
     * @param jd Julian Date
     * @param leapSecs Leap Seconds (TAI - UTC)
     * @return Nutation of the obliquity of the ecliptic in degrees
     */
    private static NObliquity(jd: number, leapSecs: number): number {
        let deps, lsun, lmoon, omega;
        let dt, t;

        dt = leapSecs;
        dt += 32.184;

        /* Change units to centuries */

        dt /= (36525 * 24. * 60. * 60.);

        /* Julian centuries for the JD from a base epoch 2000.0 */

        t = (jd - 2451545.0) / 36525.0;

        /* Correct for dt = tt - ut1  */

        t += dt;

        /* Longitude of the ascending node of the Moon's mean orbit in degrees */

        omega = 125.04452 - 1934.136261 * t + 0.0020708 * t * t + t * t * t / 450000.;

        /* Mean longitudes of the Sun and the Moon in degrees */

        lsun = Map360(280.4665 + 3600.7698 * t);
        lmoon = Map360(218.3165 + 481267.8813 * t);

        /* Convert to radians */

        omega = omega * Math.PI / 180.;
        lsun = lsun * Math.PI / 180.;
        lmoon = lmoon * Math.PI / 180.;

        /* Nutation of the obliquity in seconds of arc for the JD */

        deps = 9.20 * Math.cos(omega) + 0.57 * Math.cos(2. * lsun) +
            0.1 * Math.cos(2. * lmoon) - 0.09 * Math.cos(2. * omega);

        /* Convert to degrees */

        deps /= 3600.;

        return (deps);
    }

    /**
     * Add or remove nutation for this Julian Date.
     *
     * @param jd Julian Date of interest
     * @param ra Right Ascension in hours
     * @param dec Declination in degrees
     * @param leapSecs Leap Seconds (TAI - UTC)
     * @param dirflag 1 = add nutation, -1 = remove nutation
     * @return Modified ra and dec as {ra,dec}
     */
    private static Nutation(jd: number, raDecIn: number[], leapSecs: number, dirflag: number) {
        let ra_in, dec_in;
        let elong, elat, dlong;
        let dpsi, deps, eps0;
        let dra, ddec;
        let dir;
        let radec: number[] = [raDecIn[0], raDecIn[1]];
        let elonglat: number[] = [0, 0];

        /* Routine will add nutation by default */

        dir = 1.0;
        if (dirflag < 0) {
            dir = -1.0;
        }

        ra_in = raDecIn[0];
        dec_in = raDecIn[1];

        /* Near the celestial pole convert to ecliptic coordinates */

        if (Math.abs(dec_in) > 85.) {
            elonglat = SkyProjection.CelestialToEcliptical(jd, ra_in, dec_in, leapSecs);

            elong = elonglat[0];
            elat = elonglat[1];

            dlong = dir * SkyProjection.NLongitude(jd, leapSecs);
            elong += dlong;

            radec = SkyProjection.EclipticalToCelestial(jd, elong, elat, leapSecs);
        }
        else {
            dpsi = dir * SkyProjection.NLongitude(jd, leapSecs);
            eps0 = SkyProjection.MeanObliquity(jd, leapSecs);
            deps = dir * SkyProjection.NObliquity(jd, leapSecs);
            dra = (Math.cos(eps0 * Math.PI / 180.) +
                Math.sin(eps0 * Math.PI / 180.) * Math.sin(ra_in * Math.PI / 12.) * Math.tan(dec_in * Math.PI / 180.)) * dpsi -
                Math.cos(ra_in * Math.PI / 12.) * Math.tan(dec_in * Math.PI / 180.) * deps;
            dra /= 15.;
            ddec = Math.sin(eps0 * Math.PI / 180.) * Math.cos(ra_in * Math.PI / 12.) * dpsi +
                Math.sin(ra_in * Math.PI / 12.) * deps;
            radec[0] = ra_in + dra;
            radec[1] = dec_in + ddec;
        }

        return radec;

    }


    /**
     * [RA, DEC] (J2000 degrees) => [RA, DEC] (JNOW degrees)
     * epoch: ms since epoch for JNOW
     */
    public static raDecEpochFromJ2000(radec: number[], epoch: number): number[] {
        const jd: number = SkyProjection.JDEpoch(epoch);
        const leapSecs: number = SkyProjection.getLeapSecForEpoch(epoch);

        const precession = SkyProjection.Precession(2000.0, jd, [radec[0] / 15, radec[1]], 1);
        const nutation = SkyProjection.Nutation(jd, precession, leapSecs, 1);

        return [nutation[0] * 15, nutation[1]];

    }

    /**
     * [RA, DEC] (JNOW degrees) => [RA, DEC] (J2000 degrees)
     * epoch: ms since epoch for JNOW
     */
    public static J2000RaDecFromEpoch(radec: number[], epoch: number): number[] {
        const jd = SkyProjection.JDEpoch(epoch);

        /* Remove nutation for JD */
        const nutation = SkyProjection.Nutation(jd, [radec[0] / 15, radec[1]], SkyProjection.getLeapSecForEpoch(epoch), -1);

        /* Remove precession to EOD from J2000 */
        const precession = SkyProjection.Precession(2000.0, jd, nutation, -1);

        /* Return J2000 coordinates */
        return [precession[0] * 15, precession[1]];
    }

    // lstRelRa: lst - ra % 24
    public static lstRelRaDecToAltAz(lstRelRaDec: {relRaDeg: number, dec: number}, geoCoords: {lat:number, long:number}): {alt: number, az:number}
    {
        let ha = lstRelRaDec.relRaDeg / 15;
        ha *= Math.PI/12.;
        const phi = geoCoords.lat  *Math.PI/180.;
        const dec = lstRelRaDec.dec*Math.PI/180.;
        let altitude = Math.asin(Math.sin(phi)*Math.sin(dec)+Math.cos(phi)*Math.cos(dec)*Math.cos(ha));
        altitude *= 180.0/Math.PI;
        let azimuth = Math.atan2(-Math.cos(dec)*Math.sin(ha), Math.sin(dec)*Math.cos(phi)-Math.sin(phi)*Math.cos(dec)*Math.cos(ha));
        azimuth *= 180.0/Math.PI;

        azimuth = Map360(azimuth);

        return {alt: altitude, az: azimuth};
    }

    // * In this projection, north pole is toward z axis (0,0,1). 
    // * x axis points to the zenith
    // * y axis points east
    public static readonly altAzRotation = {
        // Up/down
        toNorth: {id: 1, sign: 1},
        toSouth: {id: 1, sign: -1},

        // Rotation of azimuth
        toEast:  {id: 0, sign: -1},
        toWest:  {id: 0, sign: 1},
    };

    public static rotate(xyz: number[], axis: RotationDefinition, angle:number)
    {
        const axes = [[1,2],[0,2],[0,1]];
        const a = axes[axis.id][0];
        const b = axes[axis.id][1];
        angle = axis.sign * deg2rad(angle);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const ret = [...xyz];

        ret[a] = xyz[a] * cos - xyz[b] * sin;
        ret[b] = xyz[b] * cos + xyz[a] * sin;

        return ret;
    }

    public static altAzToLstRelRaDec(altAz: {alt: number, az:number}, geoCoords: {lat:number, long:number}): {relRaDeg: number, dec: number}
    {
        // Passer en 3D.
        const xyz = SkyProjection.convertAltAzTo3D(altAz);
        console.log("zenith is ", xyz);
        const rotated = SkyProjection.rotate(xyz, SkyProjection.altAzRotation.toNorth, 90 + geoCoords.lat);
        console.log("should be on [1,0,0] ", rotated);
        const res = SkyProjection.convert3DToAltAz(rotated);

        return {relRaDeg:Map180(-res.az), dec: -res.alt};
    }

    // Usefull resources:
    // - http://www.csgnetwork.com/siderealjuliantimecalc.html
    // - http://neoprogrammics.com/sidereal_time_calculator/
    //
    public static getLocalSideralTime(time:number, long:number)
    {
        const d = (time - j2000Epoch) / 86400;
        console.log('d=', d);
        const UT = (time % 86400) / 3600.0;
        console.log('ut=' + UT);

        // Formula from http://www2.arnes.si/~gljsentvid10/altaz.html
        return ((100.46+0.985647 * d+long + 15 *UT) / 15) % 24;

        // https://astronomy.stackexchange.com/questions/24859/local-sidereal-time
        // return ((100.4606184+0.9856473662862* d+long + 15 *UT) / 15) % 24;
    }


    // Returns a - b in the range [-12, 12[
    public static raDiff(a: number, b: number) {
        let ret = (a - b) % 24;
        // ret is in the range ]-24, 24[
        if (ret < -12) {
            ret += 24;
        }
        if (ret >= 12) {
            ret -= 24;
        }
        return ret;
    }
    public static raDegDiff(a: number, b: number) {
        return Map180(a - b);
    }
}

#ifndef BITMASK_H_
#define BITMASK_H_

#include <vector>
#include <cstdint>
#include <iostream>
#include <memory>

#include "FixedSizeBitSet.h"

class BitMask;
class BitMaskIterator;

class CGroupComputer {
	friend class BitMask;

	const BitMask & bm;
	std::vector<int> connexityByPix;
	std::vector<int> groupSize;
	std::vector<int> finalVector;
	int groupCount;

	CGroupComputer(const BitMask & _bm);
	int newGroup();

	int mergeGroups(int a, int b);
	void proceed();

	int findActualGroup(int grp);
	std::vector<std::shared_ptr<std::vector<int>>> result();
};

class BitMask {
	friend class BitMaskIterator;
	friend class CGroupComputer;

	int sx, sy;
	int x0, y0, x1, y1;
	FixedSizeBitSet content;

	int offset(int x, int y) const
	{
		return x - x0 + (y - y0) * sx;
	}

public:
	BitMask(): content(1) {
		sx = 1;
		sy = 1;
		x0 = 0;
		y0 = 0;
		x1 = 0;
		y1 = 0;
	}

	BitMask(int _x0, int _y0, int _x1, int _y1)
		:
		sx(_x1 - _x0 + 1),
		sy(_y1 - _y0 + 1),
		content(sx * sy),
		x0(_x0),
		y0(_y0),
		x1(_x1),
		y1(_y1)
	{
	}

	BitMask & operator=(const BitMask & other);

	void fill(bool v)
	{
		content.set(v);
	}

	void set(int x, int y, bool v)
	{
		int off;
		uint32_t mask;
		content.set(offset(x, y), v);
	}


	BitMaskIterator iterator() const;

	bool get(int x, int y) const {
		return content.get(offset(x, y));
	}

	bool isClear(int x, int y) const {
		return !get(x, y);
	}

    bool isEmpty() const {
		return content.getCardinality() == 0;
    }

	FixedSizeBitSet eraseCol(FixedSizeBitSet result, int x) {
		for(int y = 0; y < sy; ++y) {
			result.clear(x + sx * y);
		}
		return result;
	}

	// Tous les pixels qui ont au moins un voisin 0
	void erode() {
		if (x1 - x0 > 2 && y1 - y0 > 2) {
			FixedSizeBitSet zeroes(content);
			zeroes.invert();

			FixedSizeBitSet zeroesNeighboors(eraseCol(zeroes.shift(-1), sx - 1));
			zeroesNeighboors |= eraseCol(zeroes.shift(1), 0);
			zeroesNeighboors |= zeroes.shift(-sx);
			zeroesNeighboors |= zeroes.shift(sx);

			zeroesNeighboors.invert();

			content &= zeroesNeighboors;

/*			BitMask toZero(x0, y0, x1, y1);
			toZero.fill(1);

			for(int y = y0 + 1; y <= y1 - 1; ++y)
				for(int x = x0 + 1; x <= x1 - 1; ++x)
					if (get(x, y) && isClear(x-1, y) && isClear(x +1 ,y) && isClear(x, y-1) && isClear(x, y + 1)) {
						toZero.set(x, y, 0);
					}

			doAnd(toZero.content);*/
		}

		// Les bords disparaissent à tous les coups
		for(int x = x0; x <= x1; ++x) {
			set(x, y0, 0);
			set(x, y1, 0);
		}

		for(int y = y0 + 1; y <= y1 - 1; ++y) {
			set(x0, y, 0);
			set(x1, y, 0);
		}
	}

	// Tous les pixels qui ont au moins un voisin 1 deviennent 1
	void grow() {
		BitMask orMask(x0, y0, x1, y1);
		for(int y = y0; y <= y1; ++y)
			for(int x = x0; x <= x1; ++x)
				if (isClear(x, y) &&
					(
						(x > x0 && get(x-1, y))
						|| (x < x1 && get(x + 1, y))
						|| (y > y0 && get(x, y - 1))
						|| (y < y1 && get(x, y + 1))))
				{
					orMask.set(x, y, 1);
				}

		content |= orMask.content;
	}

	void substract(const BitMask & from)
	{
		if (from.x0 == x0 && from.x1 == x1 && from.y0 == y0 && from.y1 == y1) {
			// Same size.
			content -= from.content;
			return;
		}
		// calculer le recouvrement
		// faire un nand
		int tx0 = x0;
		int tx1 = x1;
		int ty0 = y0;
		int ty1 = y1;
		if (tx0 < from.x0) tx0 = from.x0;
		if (ty0 < from.y0) ty0 = from.y0;
		if (tx1 > from.x1) tx1 = from.x1;
		if (ty1 > from.y1) ty1 = from.y1;
		
		for(int y = ty0; y <= ty1; ++y)
			for(int x = tx0; x <= tx1; ++x) {
				if (from.get(x, y)) {
					set(x, y, false);
				}
			}
	}


	void grow(const BitMask & from);
	void erode(const BitMask & mask);
	void morph(const BitMask & mast, bool isGrow);

	std::vector<std::shared_ptr<std::vector<int>>> calcConnexityGroups() const
	{
		CGroupComputer c(*this);
		c.proceed();
		return c.result();
	}

    std::string toString() const;
};


class BitMaskIterator {
	friend class BitMask;
	const BitMask & bm;
	int offset;
	BitMaskIterator(const BitMask & bm);
public:
	bool next()
	{
		if (offset < -1) {
			return false;
		}
		offset = bm.content.nextSetBit(offset + 1);
		if (offset == -1) {
			offset = -1;
			return false;
		}
		return true;
	}

	int x() const
	{
		return bm.x0 + offset % bm.sx;
	}

	int y() const
	{
		return bm.y0 + offset / bm.sx;
	}
};

#endif

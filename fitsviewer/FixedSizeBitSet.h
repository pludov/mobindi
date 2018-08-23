#ifndef FIXEDSIZEBITSET_H_
#define FIXEDSIZEBITSET_H_

#include <string>

class FixedSizeBitSet {
	int length;
	mutable int cardinality;
	uint64_t * words;

    int wordsLength() const;
public:

	FixedSizeBitSet(int length);

	FixedSizeBitSet(const FixedSizeBitSet & copy);
    
	
	bool get(int offset) const;
    
	
	void set(int offset);
    void clear(int offset);
    void set(int offset, bool b);
	
    int nextSetBit(int fromIndex) const;
	int nextClearBit(int fromIndex) const;

	const FixedSizeBitSet & operator &=(const FixedSizeBitSet & other);
    const FixedSizeBitSet & operator |=(const FixedSizeBitSet & other);
    const FixedSizeBitSet & operator ^=(const FixedSizeBitSet & other);
    
    FixedSizeBitSet * shift(int amount) const;
	
	void invert();
    
    int getCardinality() const;

    std::string toString() const;
    int size() const;
};


#endif
